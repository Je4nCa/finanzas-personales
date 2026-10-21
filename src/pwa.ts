import { registerSW } from 'virtual:pwa-register'
import { create } from 'zustand'

/** Busca versiones nuevas cada 15 minutos mientras la app está abierta, y al volver a ella. */
const CHECK_EVERY_MS = 15 * 60 * 1000

interface AppUpdate {
  /** Hay una versión nueva descargada esperando. */
  available: boolean
  dismissed: boolean
  checking: boolean
  apply: () => void
  /** Busca ya; devuelve true si encontró una versión nueva. */
  check: () => Promise<boolean>
}

let registration: ServiceWorkerRegistration | undefined

export const useAppUpdate = create<AppUpdate>()((set, get) => ({
  available: false,
  dismissed: false,
  checking: false,
  apply: () => {
    // Si la versión nueva espera, se le pide tomar el control (recarga al lograrlo).
    // Si ya está activa (p. ej. la página no estaba controlada) o no responde, se recarga igual.
    if (registration?.waiting) {
      void updateSW(true)
      setTimeout(() => location.reload(), 3000)
    } else {
      location.reload()
    }
  },
  check: async () => {
    if (!registration) return false
    set({ checking: true })
    try {
      await registration.update()
      // El aviso llega por onNeedRefresh cuando la versión nueva termina de instalarse.
      await new Promise((r) => setTimeout(r, 1500))
      return get().available || !!registration.waiting || !!registration.installing
    } catch {
      return false
    } finally {
      set({ checking: false })
    }
  },
}))

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh: () => useAppUpdate.setState({ available: true, dismissed: false }),
  onRegisteredSW: (_url, r) => {
    registration = r
    if (!r) return
    setInterval(() => document.visibilityState === 'visible' && void r.update().catch(() => {}), CHECK_EVERY_MS)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void r.update().catch(() => {}))
  },
})
