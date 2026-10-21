import { Cloud, CloudOff, LogOut, RefreshCw } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { loadEngine, syncConfigured, useSyncStatus, type SyncState } from '../sync/status'
import { useOverlay } from '../store/ui'
import { Field } from './ui'

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

/** Cuenta de Supabase: entrar, crear cuenta, estado de la sincronización. */
export function AccountSection() {
  const { email, state, lastSyncedAt, error } = useSyncStatus()
  const showToast = useOverlay((s) => s.showToast)
  const [mail, setMail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [, tick] = useState(0)

  // Refresca el "hace X min".
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000)
    return () => clearInterval(t)
  }, [])

  if (!syncConfigured) return null

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
    } catch (e) {
      setMessage(authError(e))
    } finally {
      setBusy(false)
    }
  }

  const submit = (mode: 'in' | 'up') => (e?: FormEvent) => {
    e?.preventDefault()
    if (!mail.includes('@') || password.length < 6) {
      setMessage('Escribí tu correo y una contraseña de al menos 6 caracteres.')
      return
    }
    void run(async () => {
      const engine = await loadEngine()
      if (mode === 'in') {
        await engine.signIn(mail.trim(), password)
        setPassword('')
        showToast('Sesión iniciada')
      } else {
        const { needsConfirmation } = await engine.signUp(mail.trim(), password)
        setPassword('')
        setMessage(needsConfirmation ? 'Te mandé un correo para confirmar la cuenta. Confirmala y después entrá aquí.' : null)
        if (!needsConfirmation) showToast('Cuenta creada')
      }
    })
  }

  return (
    <>
      <div className="section-title" style={{ margin: '10px 2px 0' }}>Cuenta y nube</div>
      {email ? (
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
          <div className="form-actions" style={{ marginTop: 14 }}>
            <button className="pill-btn glass block" style={{ height: 42 }} disabled={state === 'syncing'} onClick={() => void loadEngine().then((m) => m.syncNow())}>
              <RefreshCw /> Sincronizar
            </button>
            <button className="pill-btn glass block danger" style={{ height: 42 }} disabled={busy} onClick={() => void run(async () => (await loadEngine()).signOut())}>
              <LogOut /> Salir
            </button>
          </div>
          <p className="fine-print">Tus datos se guardan en este dispositivo y en tu base de Supabase; se sincronizan entre tu iPhone y tu Mac.</p>
        </div>
      ) : (
        <form className="card account form" onSubmit={submit('in')}>
          <Field label="Correo">
            <input className="input" type="email" autoComplete="email" inputMode="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="tu@correo.com" />
          </Field>
          <Field label="Contraseña">
            <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {message && <div className="chip purple" style={{ whiteSpace: 'normal', padding: '8px 10px' }}>{message}</div>}
          <div className="form-actions">
            <button type="button" className="pill-btn glass block" style={{ height: 44 }} disabled={busy} onClick={() => submit('up')()}>
              Crear cuenta
            </button>
            <button type="submit" className="pill-btn dark block" style={{ height: 44 }} disabled={busy}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
          </div>
          <p className="fine-print">Al entrar, lo que tenés en este dispositivo se sube a tu cuenta y se combina con lo que ya esté en la nube.</p>
        </form>
      )}
    </>
  )
}

function authError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar el correo: revisá tu bandeja y tocá el enlace.'
  if (/already registered/i.test(msg)) return 'Ese correo ya tiene cuenta. Usá "Entrar".'
  if (/failed to fetch|network/i.test(msg)) return 'Sin conexión con Supabase. Revisá tu internet.'
  return msg
}
