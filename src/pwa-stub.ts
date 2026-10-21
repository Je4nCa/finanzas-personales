// En el artifact no hay service worker: este módulo reemplaza a virtual:pwa-register.
export function registerSW(_options?: unknown) {
  return () => Promise.resolve()
}
