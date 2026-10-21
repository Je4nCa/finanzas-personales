import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { AuthGate } from './components/AuthGate'
import { UpdateBanner } from './components/UpdateBanner'
import { loadEngine, syncConfigured } from './sync/status'
import './pwa'
import './styles.css'

if (syncConfigured) void loadEngine().then((m) => m.startSync())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>
      <App />
    </AuthGate>
    <UpdateBanner />
  </StrictMode>,
)
