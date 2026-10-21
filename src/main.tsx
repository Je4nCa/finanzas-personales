import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import { AuthGate } from './components/AuthGate'
import { loadEngine, syncConfigured } from './sync/status'
import './styles.css'

registerSW({ immediate: true })

if (syncConfigured) void loadEngine().then((m) => m.startSync())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
  </StrictMode>,
)
