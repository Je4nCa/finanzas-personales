import { Fingerprint, LockKeyhole, ScanFace } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { create } from 'zustand'
import { biometricAvailable, disableLock, getLock, lockUsesServerPasskey, saveServerLock, unlockWithBiometric } from '../lib/biometric'
import { idleTooLong, markActive, readLastActive } from '../lib/idle'
import { loadEngine, syncConfigured, useSyncStatus } from '../sync/status'
import { Field } from './ui'

const SKIP_KEY = 'finanzas-lock-skip'

interface Gate {
  locked: boolean
  /** Contenido tapado mientras la app está en segundo plano (selector de apps). */
  covered: boolean
  setupDone: boolean
}

export const useGate = create<Gate>()(() => ({
  // Recargar o actualizar la app no vuelve a pedir Face ID si se usó hace menos de una hora.
  locked: getLock() !== null && idleTooLong(readLastActive()),
  covered: false,
  // La versión anterior guardaba una passkey solo local: se ofrece actualizarla.
  setupDone: lockUsesServerPasskey() || readSkip(),
}))

// Cada desbloqueo (Face ID, contraseña, activar el candado) cuenta como uso.
useGate.subscribe((s) => {
  if (!s.locked && !s.covered) markActive()
})

function readSkip() {
  try {
    return localStorage.getItem(SKIP_KEY) === '1'
  } catch {
    return false
  }
}

const isMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints === 0
const BIO = isMac ? 'Touch ID' : 'Face ID'

/** Sin sesión no se muestra nada de la app. Con candado activo, pide Face ID / Touch ID tras una hora sin usarla. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, email } = useSyncStatus()
  const { locked, covered, setupDone } = useGate()
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    // Solo cuenta como uso el tiempo con la app desbloqueada y a la vista.
    const touch = () => {
      if (!useGate.getState().locked && document.visibilityState === 'visible') markActive()
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        if (!useGate.getState().locked) markActive()
        if (getLock()) useGate.setState({ covered: true })
      } else {
        useGate.setState((g) => ({ covered: false, locked: g.locked || (getLock() !== null && idleTooLong(readLastActive())) }))
      }
    }
    touch()
    const t = setInterval(touch, 60_000)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', touch)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', touch)
    }
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
  if (/passkey|webauthn/i.test(msg) && /disabled|not enabled|not_enabled/i.test(msg)) return 'Las passkeys todavía no están activadas en Supabase.'
  if (/credential|passkey/i.test(msg) && /not found|unknown|invalid/i.test(msg)) return `Ese ${BIO} no está registrado en tu cuenta. Entrá con tu contraseña y activalo de nuevo.`
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
  const [canPasskey, setCanPasskey] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void biometricAvailable().then(setCanPasskey)
  }, [])

  const passkeyLogin = async () => {
    setBusy(true)
    setError(null)
    try {
      const email = await (await loadEngine()).signInWithPasskey()
      // Acaba de pasar Face ID: entra sin pedirlo otra vez, y la passkey queda como candado.
      if (email) saveServerLock(email)
      useGate.setState({ locked: false, setupDone: true })
    } catch (e) {
      setError(authError(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <GateShell icon={<LockKeyhole />} title="Finanzas Personales" subtitle="Iniciá sesión para ver tus finanzas.">
      {canPasskey && (
        <div className="form gate-form" style={{ marginBottom: 18 }}>
          {error && <div className="chip red gate-error">{error}</div>}
          <button className="pill-btn dark block" disabled={busy} onClick={() => void passkeyLogin()}>
            {isMac ? <Fingerprint /> : <ScanFace />} Entrar con {BIO}
          </button>
          <div className="gate-divider">o con tu contraseña</div>
        </div>
      )}
      <PasswordForm submitLabel="Entrar" onDone={() => useGate.setState({ locked: false })} />
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
  const upgrading = getLock() !== null
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
      await (await loadEngine()).registerPasskey()
      saveServerLock(email)
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
      title={upgrading ? `Actualizá ${BIO}` : `Protegé la app con ${BIO}`}
      subtitle={
        upgrading
          ? `Ahora ${BIO} también te sirve para entrar después de cerrar sesión, sin correo ni contraseña.`
          : `Cada vez que abras la app te va a pedir ${BIO}, y también te sirve para entrar sin contraseña.`
      }
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
    await (await loadEngine()).registerPasskey()
    saveServerLock(email)
    useGate.setState({ setupDone: true })
  },
  disable: () => disableLock(),
  // Face ID queda guardado: después de cerrar sesión se vuelve a entrar con él.
  signOut: async () => {
    await (await loadEngine()).signOut()
    useGate.setState({ locked: false })
  },
}
