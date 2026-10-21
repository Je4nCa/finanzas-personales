import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { loadEngine, syncConfigured, useSyncStatus, type SyncState } from '../sync/status'
import { useOverlay } from '../store/ui'
import { lockControls } from './AuthGate'

const STATE_LABEL: Record<SyncState, string> = {
  off: 'Sin sincronizar',
  syncing: 'Sincronizando…',
  synced: 'Sincronizado',
  offline: 'Sin conexión: se sube al volver',
  error: 'Error al sincronizar',
}

function ago(ts: number | null) {
  if (!ts) return ''
  const s = Math.round((Date.now() - ts) / 1000)
  if (s < 60) return 'hace un momento'
  if (s < 3600) return `hace ${Math.round(s / 60)} min`
  return `hace ${Math.round(s / 3600)} h`
}

/** Cuenta de Supabase: estado de la sincronización, bloqueo biométrico y salida. El login vive en AuthGate. */
export function AccountSection() {
  const { email, state, lastSyncedAt, error } = useSyncStatus()
  const { showToast, close } = useOverlay()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [lockOn, setLockOn] = useState(lockControls.isOn())
  const [, tick] = useState(0)

  // Refresca el "hace X min".
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (!syncConfigured || !email) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const toggleLock = () =>
    void run(async () => {
      if (lockOn) {
        lockControls.disable()
        setLockOn(false)
        showToast(`${lockControls.label} desactivado`)
      } else {
        await lockControls.enable(email)
        setLockOn(true)
        showToast(`${lockControls.label} activado`)
      }
    })

  return (
    <>
      <div className="section-title" style={{ margin: '10px 2px 0' }}>Cuenta y seguridad</div>
      <div className="card account">
        <div className="row">
          <span className="icon-tile">{state === 'error' || state === 'offline' ? <CloudOff /> : <Cloud />}</span>
          <div className="spacer" style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 550, overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
            <div className={`sync-state ${state}`}>
              {STATE_LABEL[state]}
              {state === 'synced' && lastSyncedAt ? ` · ${ago(lastSyncedAt)}` : ''}
            </div>
          </div>
        </div>
        {state === 'error' && error && <div className="chip red" style={{ marginTop: 10, whiteSpace: 'normal' }}>{error}</div>}

        <div className="divider" />
        <div className="row">
          <div className="spacer">
            <div style={{ fontWeight: 520 }}>Bloqueo con {lockControls.label}</div>
            <div className="sync-state">{lockOn ? 'Se pide tras 1 hora sin usar la app y sirve para entrar' : 'Desactivado'}</div>
          </div>
          <button className={`pill-btn ${lockOn ? 'glass' : 'dark'}`} disabled={busy} onClick={toggleLock}>
            {lockOn ? 'Desactivar' : 'Activar'}
          </button>
        </div>

        {message && <div className="chip red" style={{ marginTop: 12, whiteSpace: 'normal', padding: '8px 10px' }}>{message}</div>}
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="pill-btn glass block" style={{ height: 42 }} disabled={state === 'syncing'} onClick={() => void loadEngine().then((m) => m.syncNow())}>
            <RefreshCw /> Sincronizar
          </button>
          <button
            className="pill-btn glass block danger"
            style={{ height: 42 }}
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await lockControls.signOut()
                close()
              })
            }
          >
            <LogOut /> Cerrar sesión
          </button>
        </div>
        <p className="fine-print">Al cerrar sesión se borran tus datos de este dispositivo; siguen guardados en tu cuenta y volvés a entrar con {lockControls.label}.</p>
      </div>
    </>
  )
}
