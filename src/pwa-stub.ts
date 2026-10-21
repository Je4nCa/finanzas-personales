// En el artifact no hay service worker: este módulo reemplaza a virtual:pwa-register.
export function registerSW() {
  return () => Promise.resolve()
}
