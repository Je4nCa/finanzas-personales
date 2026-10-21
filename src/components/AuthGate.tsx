import { Fingerprint, LockKeyhole, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { create } from 'zustand'
import { biometricAvailable, disableLock, enableLock, getLock, unlockWithBiometric } from '../lib/biometric'
import { loadEngine, syncConfigured, useSyncStatus } from '../sync/status'
import { Field } from './ui'

/** Tiempo fuera de la app tras el cual vuelve a pedir Face ID / Touch ID. */
const RELOCK_AFTER_MS = 60_000
const SKIP_KEY = 'finanzas-lock-skip'

interface Gate {
  locked: boolean
  /** Contenido tapado mientras la app está en segundo plano (selector de apps). */
  covered: boolean
  setupDone: boolean
}

export const useGate = create<Gate>()(() => ({
  locked: getLock() !== null,
  covered: false,
  setupDone: getLock() !== null || readSkip(),
}))

function readSkip() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

const isMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints === 0
const BIO = isMac ? 'Touch ID' : 'Face ID'

/** Sin sesión no se muestra nada de la app. Con candado activo, pide Face ID / Touch ID al abrir y al volver. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, email } = useSyncStatus()
  const { locked, covered, setupDone } = useGate()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        if (getLock()) useGate.setState({ covered: true })
      } else {
        const away = Date.now() - hiddenAt
        useGate.setState((g) => ({ covered: false, locked: g.locked || (getLock() !== null && hiddenAt > 0 && away > RELOCK_AFTER_MS) }))
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  if (!syncConfigured) return <>{children}</>
  if (!ready && !slow) return <div className="gate" />
  if (!email) return <LoginScreen />
  if (locked && getLock()) return <LockScreen email={email} />
  if (!setupDone) return <EnableLockScreen email={email} />
  return (
    <>
      {children}
      {covered && <div className="gate gate-cover"><LockKeyhole /></div>}
    </>
  )
}

function GateShell({ icon, title, subtitle, children }: { icon: ReactNode; title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="gate">
      <div className="gate-card">
        <div className="gate-icon">{icon}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
        {children}
      </div>
    </div>
  )
}

function authError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.'
  if (/email not confirmed/i.test(msg)) return 'Falta confirmar el correo: revisá tu bandeja y tocá el enlace.'
  if (/failed to fetch|network|load failed/i.test(msg)) return 'Sin conexión con el servidor. Revisá tu internet.'
  if (/notallowed|cancel|abort|timed out/i.test(msg)) return `Se canceló ${BIO}. Probá otra vez o usá tu contraseña.`
  return msg
}

function PasswordForm({ email: fixedEmail, submitLabel, onDone }: { email?: string; submitLabel: string; onDone?: () => void }) {
  const [email, setEmail] = useState(fixedEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.includes('@') || !password) return setError('Escribí tu correo y tu contraseña.')
    setBusy(true)
    setError(null)
    try {
      await (await loadEngine()).signIn(email.trim(), password)
      setPassword('')
      onDone?.()
    } catch (err) {
      setError(authError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form gate-form" onSubmit={submit}>
      {!fixedEmail && (
        <Field label="Correo">
          <input className="input" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      )}
      <Field label="Contraseña">
        <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus={!!fixedEmail} />
      </Field>
      {error && <div className="chip red gate-error">{error}</div>}
      <button type="submit" className="pill-btn dark block" disabled={busy}>
        {busy ? 'Entrando…' : submitLabel}
      </button>
    </form>
  )
}

function LoginScreen() {
  return (
    <GateShell icon={<LockKeyhole />} title="Finanzas Personales" subtitle="Iniciá sesión para ver tus finanzas.">
      <PasswordForm submitLabel="Entrar" />
    </GateShell>
  )
}

function LockScreen({ email }: { email: string }) {
  const [error, setError] = useState<string | null>(null)
  const [usePassword, setUsePassword] = useState(false)
  const tried = useRef(false)

  const unlock = async () => {
    setError(null)
    try {
      await unlockWithBiometric()
      useGate.setState({ locked: false })
    } catch (e) {
      setError(authError(e))
    }
  }

  // Al abrir se intenta solo; si el navegador exige un toque, queda el botón.
  useEffect(() => {
    if (tried.current) return
    tried.current = true
    void unlockWithBiometric()
      .then(() => useGate.setState({ locked: false }))
      .catch(() => {})
  }, [])

  return (
    <GateShell icon={isMac ? <Fingerprint /> : <ScanFace />} title="App bloqueada" subtitle={email}>
      {usePassword ? (
        <PasswordForm email={email} submitLabel="Desbloquear" onDone={() => useGate.setState({ locked: false })} />
      ) : (
        <div className="form gate-form">
          {error && <div className="chip red gate-error">{error}</div>}
          <button className="pill-btn dark block" onClick={() => void unlock()}>
            Desbloquear con {BIO}
          </button>
          <button className="pill-btn glass block" onClick={() => setUsePassword(true)}>
            Usar contraseña
          </button>
        </div>
      )}
    </GateShell>
  )
}

function EnableLockScreen({ email }: { email: string }) {
  const [available, setAvailable] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void biometricAvailable().then((ok) => {
      setAvailable(ok)
      // Sin Face ID / Touch ID en este dispositivo no hay nada que configurar.
      if (!ok) useGate.setState({ setupDone: true })
    })
  }, [])

  const enable = async () => {
    setError(null)
    try {
      await enableLock(email)
      useGate.setState({ setupDone: true, locked: false })
    } catch (e) {
      setError(authError(e))
    }
  }

  const skip = () => {
    try {
      localStorage.setItem(SKIP_KEY, '1')
    } catch {
      // Se vuelve a ofrecer la próxima vez.
    }
    useGate.setState({ setupDone: true })
  }

  if (available === null) return <div className="gate" />

  return (
    <GateShell
      icon={isMac ? <Fingerprint /> : <ScanFace />}
      title={`Protegé la app con ${BIO}`}
      subtitle={`Cada vez que abras la app te va a pedir ${BIO}. Si alguna vez falla, podés entrar con tu contraseña.`}
    >
      <div className="form gate-form">
        {error && <div className="chip red gate-error">{error}</div>}
        <button className="pill-btn dark block" onClick={() => void enable()}>
          Activar {BIO}
        </button>
        <button className="pill-btn glass block" onClick={skip}>
          Ahora no
        </button>
      </div>
    </GateShell>
  )
}

/** Para Ajustes: activar/quitar el candado y cerrar sesión limpiando el dispositivo. */
export const lockControls = {
  label: BIO,
  isOn: () => getLock() !== null,
  enable: async (email: string) => {
    await enableLock(email)
    useGate.setState({ setupDone: true })
  },
  disable: () => disableLock(),
  signOut: async () => {
    await (await loadEngine()).signOut()
    disableLock()
    try {
      localStorage.removeItem(SKIP_KEY)
    } catch {
      // Nada que limpiar.
    }
    useGate.setState({ locked: false, setupDone: false })
  },
}
