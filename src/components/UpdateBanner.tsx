import { RefreshCw, Sparkles, X } from 'lucide-react'
import { useAppUpdate } from '../pwa'

/** Aviso flotante cuando hay una versión nueva publicada. */
export function UpdateBanner() {
  const { available, dismissed, apply } = useAppUpdate()
  if (!available || dismissed) return null
  return (
    <div className="update-banner glass" role="status">
      <Sparkles size={18} />
      <span className="spacer">Nueva versión disponible</span>
      <button className="pill-btn dark" onClick={apply}>
        <RefreshCw /> Actualizar
      </button>
      <button className="icon-btn round" aria-label="Después" onClick={() => useAppUpdate.setState({ dismissed: true })}>
        <X />
      </button>
    </div>
  )
}
