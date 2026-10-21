import { CalendarClock, CreditCard, House, Mic, ReceiptText, SlidersHorizontal, Wallet } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SheetHost } from './components/forms'
import { Cards } from './screens/Cards'
import { Home } from './screens/Home'
import { Installments } from './screens/Installments'
import { Movements } from './screens/Movements'
import { Payments } from './screens/Payments'
import { addMonths } from './domain/dates'
import { useData, useUi } from './store/store'
import { useOverlay } from './store/ui'

export type Tab = 'inicio' | 'movimientos' | 'pagos' | 'tasacero' | 'tarjetas'

const TABS: { id: Tab; label: string; icon: typeof House }[] = [
  { id: 'inicio', label: 'Inicio', icon: House },
  { id: 'movimientos', label: 'Registro', icon: ReceiptText },
  { id: 'pagos', label: 'Pagos', icon: CreditCard },
  { id: 'tasacero', label: 'Mensuales', icon: CalendarClock },
  { id: 'tarjetas', label: 'Tarjetas', icon: Wallet },
]

export default function App() {
  const [tab, setTab] = useState<Tab>('inicio')
  const name = useData((s) => s.settings.userName)
  const open = useOverlay((s) => s.open)
  const toast = useOverlay((s) => s.toast)
  const theme = useData((s) => s.settings.theme)

  // Atajo de iOS: abrir la app con ?gasto=texto dictado lo deja listo para guardar.
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const text = params.get('gasto')
    if (text === null) return
    history.replaceState(null, '', location.pathname)
    const t = setTimeout(() => open({ kind: 'quick', preset: { text } }), 300)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
    // La barra de estado del iPhone toma el color de theme-color.
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0c0f' : '#f2f2f4')
  }, [theme])

  // Atajos para la Mac: ⌘K agrega, ⌘, abre Ajustes, ← → cambian de mes, 1–5 cambian de pestaña.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')
      const sheetOpen = useOverlay.getState().sheet !== null
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open({ kind: 'quick' })
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault()
        open({ kind: 'settings' })
      } else if (!typing && !sheetOpen && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const { month, setMonth } = useUi.getState()
        if (e.key === 'ArrowLeft') setMonth(addMonths(month, -1))
        else if (e.key === 'ArrowRight') setMonth(addMonths(month, 1))
        else if (/^[1-5]$/.test(e.key)) goTo(TABS[Number(e.key) - 1].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const goTo = (t: Tab) => {
    setTab(t)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="app">
      <header className="header">
        <button className="icon-btn glass" onClick={() => open({ kind: 'settings' })} aria-label="Ajustes" title="Ajustes (⌘,)">
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
        <button className="icon-btn glass" onClick={() => open({ kind: 'quick' })} aria-label="Agregar por voz" title="Agregar gasto o ingreso (⌘K)">
          <Mic />
        </button>
      </header>

      <main className={`screen screen-${tab}`} key={tab}>
        {tab === 'inicio' && <Home goTo={goTo} />}
        {tab === 'movimientos' && <Movements />}
        {tab === 'pagos' && <Payments />}
        {tab === 'tasacero' && <Installments />}
        {tab === 'tarjetas' && <Cards />}
      </main>

      <TabBar tab={tab} onChange={goTo} />

      <SheetHost />
      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}

const TAB_SIZE = 46
const TAB_GAP = 4

/** Pestañas con anchos explícitos para animar el cambio y un indicador que se desliza (transform). */
function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  const measureRef = useRef<HTMLDivElement>(null)
  const [labelWidths, setLabelWidths] = useState<number[]>([])

  useLayoutEffect(() => {
    const measure = () => setLabelWidths([...(measureRef.current?.children ?? [])].map((el) => (el as HTMLElement).offsetWidth))
    measure()
    document.fonts?.ready.then(measure)
  }, [])

  const activeIndex = TABS.findIndex((t) => t.id === tab)
  const widths = TABS.map((_, i) => (i === activeIndex && labelWidths[i] ? TAB_SIZE + 8 + labelWidths[i] + 14 : TAB_SIZE))
  const left = 6 + widths.slice(0, activeIndex).reduce((a, w) => a + w + TAB_GAP, 0)

  return (
    <nav className="tabbar glass">
      <div className="tab-measure" ref={measureRef} aria-hidden>
        {TABS.map((t) => (
          <span key={t.id}>{t.label} •</span>
        ))}
      </div>
      <span className="tab-indicator" style={{ width: widths[activeIndex], transform: `translateX(${left}px)` }} />
      {TABS.map((t, i) => (
        <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} style={{ width: widths[i] }} onClick={() => onChange(t.id)} aria-label={t.label}>
          <span className="tab-icon">
            <t.icon />
          </span>
          <span className="tab-label">{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
