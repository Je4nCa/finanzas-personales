/**
 * Bloqueo con Face ID / Touch ID usando una passkey de este dispositivo (WebAuthn).
 * Es un candado local: el sistema exige la biometría para firmar, y sin firma no se muestra la app.
 * La sesión de Supabase sigue siendo la que protege los datos en la nube.
 */

const KEY = 'finanzas-lock'

interface Lock {
  credentialId: string
  email: string
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))
const toB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

export async function biometricAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
  } catch {
    return false
  }
}

export function getLock(): Lock | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Lock) : null
  } catch {
    return null
  }
}

export function disableLock() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Sin almacenamiento no hay candado que quitar.
  }
}

/** Crea la passkey (el sistema pide Face ID / Touch ID). Debe llamarse desde un toque del usuario. */
export async function enableLock(email: string) {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Finanzas Personales', id: location.hostname },
      user: { id: random(16), name: email, displayName: email },
      challenge: random(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      attestation: 'none',
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) throw new Error('No se pudo activar el bloqueo')
  localStorage.setItem(KEY, JSON.stringify({ credentialId: toB64(cred.rawId), email } satisfies Lock))
}

/** Pide Face ID / Touch ID. Lanza error si se cancela o falla. */
export async function unlockWithBiometric() {
  const lock = getLock()
  if (!lock) return
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: fromB64(lock.credentialId) }],
      userVerification: 'required',
      timeout: 60_000,
    },
  })
  if (!assertion) throw new Error('No se pudo verificar')
}
