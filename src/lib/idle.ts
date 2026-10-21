/** Tiempo sin usar la app tras el cual vuelve a pedir Face ID / Touch ID. */
export const RELOCK_AFTER_MS = 60 * 60 * 1000

const KEY = 'finanzas-last-active'

/** Hace falta desbloquear si nunca se usó o si pasó más del límite desde el último uso. */
export function idleTooLong(lastActive: number | null, now = Date.now(), limit = RELOCK_AFTER_MS): boolean {
  return lastActive === null || now - lastActive > limit
}

export function readLastActive(): number | null {
  try {
    const v = Number(localStorage.getItem(KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

/** Marca "usada ahora" (al desbloquear, mientras está abierta y al salir o recargar). */
export function markActive(now = Date.now()) {
  try {
    localStorage.setItem(KEY, String(now))
  } catch {
    // Sin almacenamiento se pide Face ID en cada apertura.
  }
}
