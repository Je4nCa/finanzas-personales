import { createClient, type Session } from '@supabase/supabase-js'
import { get as idbGet, set as idbSet } from 'idb-keyval'
import type { AppData } from '../domain/types'
import { emptyData, selectData, useData } from '../store/store'
import { COLLECTIONS, diff, fromRow, settingsChanged, settingsFromRow, settingsToRow, TABLES, toRow, type Change, type Collection } from './mapping'
import { useSyncStatus } from './status'

/**
 * Sincronización local-primero con Supabase.
 * - Todo cambio local queda en una cola persistida y se sube cuando hay sesión y conexión.
 * - Se bajan solo las filas con updated_at posterior a la última bajada.
 * - Una fila con cambios locales sin subir no se pisa con lo que viene del servidor.
 */

const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

const META_KEY = 'finanzas-sync'
const PAGE = 1000
// Margen al pedir cambios: tolera relojes y transacciones que confirman tarde. Reaplicar es inofensivo.
const OVERLAP_MS = 2 * 60 * 1000

type Pending = Change & { v: number }
interface Meta {
  userId: string | null
  lastPulledAt: string | null
  pending: Record<string, Pending>
  settingsV: number
}

let meta: Meta = { userId: null, lastPulledAt: null, pending: {}, settingsV: 0 }
let session: Session | null = null
let applyingRemote = false
let running = false
let again = false
let flushTimer: ReturnType<typeof setTimeout> | undefined

const key = (c: Collection, id: string) => `${c}:${id}`
const saveMeta = () => idbSet(META_KEY, meta).catch(() => {})
const status = (patch: Partial<ReturnType<typeof useSyncStatus.getState>>) => useSyncStatus.setState(patch)

function waitForHydration(): Promise<void> {
  if (useData.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const off = useData.persist.onFinishHydration(() => {
      off()
      resolve()
    })
  })
}

/** Aplica cambios del servidor al store sin que vuelvan a la cola. */
function applyRemote(fn: (s: AppData) => Partial<AppData>) {
  applyingRemote = true
  try {
    useData.setState((s) => fn(selectData(s)))
  } finally {
    applyingRemote = false
  }
}

function scheduleSync(delay = 800) {
  clearTimeout(flushTimer)
  flushTimer = setTimeout(() => void syncNow(), delay)
}

async function fetchChanged(table: string, since: string | null) {
  const rows: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*').order('updated_at').range(from, from + PAGE - 1)
    if (since) q = q.gt('updated_at', new Date(Date.parse(since) - OVERLAP_MS).toISOString())
    const { data, error } = await q
    if (error) throw error
    rows.push(...data)
    if (data.length < PAGE) return rows
  }
}

/** Baja cambios. Devuelve los ids que existen en el servidor (para la primera sincronización). */
async function pull(): Promise<{ ids: Record<Collection, Set<string>>; hasSettings: boolean; maxTs: string | null }> {
  const since = meta.lastPulledAt
  let maxTs = since
  const ids = {} as Record<Collection, Set<string>>
  for (const c of COLLECTIONS) {
    const rows = await fetchChanged(TABLES[c], since)
    ids[c] = new Set(rows.filter((r) => !r.deleted_at).map((r) => String(r.id)))
    for (const r of rows) if (!maxTs || String(r.updated_at) > maxTs) maxTs = String(r.updated_at)
    const incoming = rows.filter((r) => !meta.pending[key(c, String(r.id))])
    if (incoming.length === 0) continue
    applyRemote((s) => {
      const byId = new Map((s[c] as { id: string }[]).map((x) => [x.id, x]))
      for (const r of incoming) {
        if (r.deleted_at) byId.delete(String(r.id))
        else byId.set(String(r.id), fromRow(c, r) as { id: string })
      }
      return { [c]: [...byId.values()] }
    })
  }
  const { data: settingsRows, error } = await supabase.from('settings').select('*').is('deleted_at', null)
  if (error) throw error
  const remoteSettings = settingsRows[0]
  if (remoteSettings && meta.settingsV === 0) {
    applyRemote((s) => ({ settings: { ...s.settings, ...settingsFromRow(remoteSettings) } }))
  }
  return { ids, hasSettings: !!remoteSettings, maxTs }
}

/** Sube la cola. Solo borra de la cola lo que no volvió a cambiar mientras subía. */
async function push() {
  const snapshot = Object.entries(meta.pending)
  const data = selectData(useData.getState())
  for (const c of COLLECTIONS) {
    const entries = snapshot.filter(([, p]) => p.collection === c)
    if (entries.length === 0) continue
    const items = new Map((data[c] as { id: string }[]).map((x) => [x.id, x]))
    // Un alta que ya no existe localmente es en realidad una baja.
    const upserts = entries.filter(([, p]) => p.op === 'upsert' && items.has(p.id)).map(([, p]) => ({ ...toRow(items.get(p.id)!), deleted_at: null }))
    const deletes = entries.filter(([, p]) => p.op === 'delete' || !items.has(p.id)).map(([, p]) => p.id)
    for (let i = 0; i < upserts.length; i += 500) {
      const { error } = await supabase.from(TABLES[c]).upsert(upserts.slice(i, i + 500))
      if (error) throw error
    }
    if (deletes.length) {
      const { error } = await supabase.from(TABLES[c]).update({ deleted_at: new Date().toISOString() }).in('id', deletes)
      if (error) throw error
    }
    for (const [k, p] of entries) if (meta.pending[k]?.v === p.v) delete meta.pending[k]
  }
  if (meta.settingsV > 0 && session) {
    const v = meta.settingsV
    const { error } = await supabase.from('settings').upsert({ ...settingsToRow(data.settings, session.user.id), deleted_at: null })
    if (error) throw error
    if (meta.settingsV === v) meta.settingsV = 0
  }
  await saveMeta()
}

export async function syncNow(): Promise<void> {
  if (!session) return status({ state: 'off' })
  if (!navigator.onLine) return status({ state: 'offline' })
  if (running) {
    again = true
    return
  }
  running = true
  status({ state: 'syncing', error: null })
  try {
    const uid = session.user.id
    // Otra cuenta en este dispositivo: se empieza de cero para no mezclar datos.
    if (meta.userId && meta.userId !== uid) {
      applyRemote((s) => ({ ...emptyData(), settings: { ...emptyData().settings, theme: s.settings.theme } }))
      meta = { userId: uid, lastPulledAt: null, pending: {}, settingsV: 0 }
    }
    const firstSync = !meta.lastPulledAt
    meta.userId = uid
    if (!firstSync) await push()
    const { ids, hasSettings, maxTs } = await pull()
    if (firstSync) {
      // Primera vez en este dispositivo: lo local que no está en la nube se sube.
      const data = selectData(useData.getState())
      for (const c of COLLECTIONS) {
        for (const item of data[c] as { id: string }[]) {
          if (!ids[c].has(item.id) && !meta.pending[key(c, item.id)]) meta.pending[key(c, item.id)] = { collection: c, id: item.id, op: 'upsert', v: 1 }
        }
      }
      if (!hasSettings) meta.settingsV = 1
      await push()
    }
    meta.lastPulledAt = maxTs ?? new Date().toISOString()
    await saveMeta()
    status({ state: 'synced', lastSyncedAt: Date.now() })
  } catch (e) {
    console.error('sync', e)
    status({ state: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e) })
  } finally {
    running = false
    if (again) {
      again = false
      scheduleSync(0)
    }
  }
}

let started = false

export async function startSync() {
  if (started) return
  started = true
  try {
    meta = { ...meta, ...((await idbGet<Meta>(META_KEY)) ?? {}) }
    await waitForHydration()
  } catch (e) {
    console.error('sync start', e)
  }

  // Cada cambio local entra a la cola (excepto los que vienen del servidor).
  useData.subscribe((next, prev) => {
    if (applyingRemote) return
    const changes = diff(selectData(prev), selectData(next))
    for (const c of changes) {
      const k = key(c.collection, c.id)
      meta.pending[k] = { ...c, v: (meta.pending[k]?.v ?? 0) + 1 }
    }
    const settingsDirty = settingsChanged(prev.settings, next.settings)
    if (settingsDirty) meta.settingsV++
    if (changes.length || settingsDirty) {
      void saveMeta()
      if (session) scheduleSync()
    }
  })

  const { data } = await supabase.auth.getSession()
  session = data.session
  status({ email: session?.user.email ?? null, ready: true })
  supabase.auth.onAuthStateChange((event, s) => {
    session = s
    status({ email: s?.user.email ?? null, ...(s ? {} : { state: 'off' as const }) })
    if (event === 'SIGNED_IN') scheduleSync(0)
  })

  window.addEventListener('online', () => scheduleSync(0))
  window.addEventListener('offline', () => status({ state: 'offline' }))
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleSync(0))
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), 60_000)

  if (session) await syncNow()
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
}

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL } })
  if (error) throw error
  // Con confirmación de correo activa no hay sesión hasta confirmar.
  return { needsConfirmation: !data.session }
}

/** Sube lo pendiente, cierra la sesión y borra los datos de este dispositivo (siguen en la nube). */
export async function signOut() {
  if (Object.keys(meta.pending).length || meta.settingsV) {
    await syncNow()
    if (Object.keys(meta.pending).length || meta.settingsV) {
      throw new Error('Hay cambios que todavía no se subieron. Conectate a internet y probá de nuevo.')
    }
  }
  await supabase.auth.signOut()
  applyRemote((s) => ({ ...emptyData(), settings: { ...emptyData().settings, theme: s.settings.theme } }))
  meta = { userId: null, lastPulledAt: null, pending: {}, settingsV: 0 }
  await saveMeta()
}
