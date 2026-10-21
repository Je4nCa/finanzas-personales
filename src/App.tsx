import { CalendarClock, CreditCard, House, Plus, ReceiptText, SlidersHorizontal, Wallet } from 'lucide-react'
import { useState } from 'react'
import { SheetHost } from './components/forms'
import { Cards } from './screens/Cards'
import { Home } from './screens/Home'
import { Installments } from './screens/Installments'
import { Movements } from './screens/Movements'
import { Payments } from './screens/Payments'
import { useData } from './store/store'
import { useOverlay } from './store/ui'

export type Tab = 'inicio' | 'movimientos' | 'pagos' | 'tasacero' | 'tarjetas'

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'inicio', label: 'Inicio', icon: House },
  { id: 'movimientos', label: 'Registro', icon: ReceiptText },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'tasacero', label: 'Tasa cero', icon: CalendarClock },
  { id: 'tarjetas', label: 'Tarjetas', icon: Wallet },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('inicio')
  const name = useData((s) => s.settings.userName)
  const open = useOverlay((s) => s.open)
  const toast = useOverlay((s) => s.toast)

  const goTo = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <header className="header">
        <button className="icon-btn glass" onClick={() => open({ kind: 'settings' })} aria-label="Ajustes">
          <SlidersHorizontal />
        </button>
        <h1>
          {tab === 'inicio' ? (
            <>
              <span className="hello">Hola</span>
              {name ? `, ${name}` : ''}
            </>
          ) : (
            TABS.find((t) => t.id === tab)!.label
          )}
        </h1>
        <button className="icon-btn glass" onClick={() => open({ kind: 'expense' })} aria-label="Nuevo gasto">
          <Plus />
        </button>
      </header>

      {tab === 'inicio' && <Home goTo={goTo} />}
      {tab === 'movimientos' && <Movements />}
      {tab === 'pagos' && <Payments />}
      {tab === 'tasacero' && <Installments />}
      {tab === 'tarjetas' && <Cards />}

      <nav className="tabbar glass">
        {TABS.map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => goTo(t.id)} aria-label={t.label}>
            <span className="tab-icon"><t.icon /></span>
            <span className="tab-label">{t.label}</span>
          </button>
        ))}
      </nav>

      <SheetHost />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
