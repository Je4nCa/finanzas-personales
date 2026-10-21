/**
 * Face ID / Touch ID con la passkey de la cuenta (registrada en Supabase, guardada en el llavero de iCloud).
 * - Iniciar sesión: Supabase verifica la passkey y crea la sesión (ver sync/engine).
 * - Bloqueo al abrir: se pide la misma passkey localmente, sin red; sin Face ID no se muestra la app.
 */

const KEY = 'finanzas-lock'

interface Lock {
  email: string
  /** true = passkey registrada en Supabase (sirve también para iniciar sesión). */
  server?: boolean
  /** Versión anterior: passkey solo local, no sirve para iniciar sesión. */
  credentialId?: string
}

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n))

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

/** La passkey del bloqueo también sirve para entrar sin contraseña. */
export const lockUsesServerPasskey = () => getLock()?.server === true

export function saveServerLock(email: string) {
  const old = getLock()
  localStorage.setItem(KEY, JSON.stringify({ email, server: true } satisfies Lock))
  // La passkey solo local de la versión anterior ya no sirve: se le avisa al sistema para que la quite del llavero.
  if (old?.credentialId) forgetLegacyPasskey(old.credentialId)
}

function forgetLegacyPasskey(credentialId: string) {
  const signal = (PublicKeyCredential as unknown as { signalUnknownCredential?: (o: { rpId: string; credentialId: string }) => Promise<void> })
    .signalUnknownCredential
  void signal?.call(PublicKeyCredential, { rpId: location.hostname, credentialId }).catch(() => {})
}

export function disableLock() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // Sin almacenamiento no hay candado que quitar.
  }
}

/** Pide Face ID / Touch ID con cualquier passkey de la app. Funciona sin internet. Lanza error si se cancela. */
export async function unlockWithBiometric() {
  const assertion = await navigator.credentials.get({
    publicKey: { challenge: random(32), rpId: location.hostname, userVerification: 'required', timeout: 60_000 },
  })
  if (!assertion) throw new Error('No se pudo verificar')
}
