import { ArrowDownLeft, CalendarClock, HandCoins, Plus, Receipt, Repeat, ShoppingBag, Wallet } from 'lucide-react'
import { useMemo } from 'react'
import { addMonths, dayInMonthLabel, monthShort } from '../domain/dates'
import { formatMoney, monthBalance } from '../domain/finance'
import type { AppData, MonthKey } from '../domain/types'
import { CreditCard, Delta, Gauge, IconTile, Money, MonthNav, Progress } from '../components/ui'
import { useUi } from '../store/store'
import { useOverlay, type SheetKind } from '../store/ui'
import { useMonthView } from '../store/useMonth'
import type { Tab } from '../App'

const change = (now: number, before: number) => (before > 0 ? (now - before) / before : NaN)

export function budgetStatus(usage: number): { label: string; tone: 'green' | 'amber' | 'red'; color: string } {
  if (usage > 1) return { label: 'Te pasaste', tone: 'red', color: 'var(--red)' }
  if (usage > 0.85) return { label: 'Cuidado', tone: 'amber', color: 'var(--amber)' }
  return { label: 'Vas bien', tone: 'green', color: 'var(--purple)' }
}

const ACTIONS: { kind: SheetKind; label: string; icon: typeof Plus }[] = [
  { kind: 'expense', label: 'Gasto', icon: ShoppingBag },
  { kind: 'fixed', label: 'Fijo', icon: Repeat },
  { kind: 'installment', label: 'Tasa cero', icon: CalendarClock },
  { kind: 'income', label: 'Ingreso', icon: ArrowDownLeft },
  { kind: 'payment', label: 'Abono', icon: HandCoins },
]

export function Home({ goTo }: { goTo: (t: Tab) => void }) {
  const { data, month, balance: b, prevBalance: pb, summaries } = useMonthView()
  const open = useOverlay((s) => s.open)
  const base = data.settings.baseCurrency
  const status = budgetStatus(b.usage)
  const hasActivity = b.income > 0 || b.expenses > 0

  return (
    <>
      <MonthNav />

      <div className="grid-2">
        <div className="card kpi">
          <div className="kpi-top">
            <IconTile><Wallet /></IconTile>Ingresos
          </div>
          <div className="kpi-value"><Money amount={b.income} currency={base} compact /></div>
          <div className="kpi-foot">
            <Delta value={change(b.income, pb.income)} />
            <span>vs mes ant.</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-top">
            <IconTile><Receipt /></IconTile>Gastos
          </div>
          <div className="kpi-value"><Money amount={b.expenses} currency={base} compact /></div>
          <div className="kpi-foot">
            <Delta value={change(b.expenses, pb.expenses)} invert />
            <span>vs mes ant.</span>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="card-head">
          <span className="title">Balance del mes</span>
          {hasActivity && <span className={`chip ${status.tone === 'red' ? 'red' : status.tone === 'green' ? 'green' : ''}`}>{status.label}</span>}
        </div>
        <Gauge
          value={b.budget > 0 ? 1 - Math.min(1, b.usage) : 0}
          label={b.free >= 0 ? 'Te queda libre' : 'Te falta'}
          display={formatMoney(Math.abs(b.free), base, { compact: true })}
          color={b.free < 0 ? 'var(--red)' : 'var(--purple)'}
        />
        <div className="divider" />
        <div className="stats-3">
          <div><span className="lbl">Variables</span><span className="val"><Money amount={b.byKind.variable} currency={base} compact /></span></div>
          <div><span className="lbl">Fijos</span><span className="val"><Money amount={b.byKind.fijo} currency={base} compact /></span></div>
          <div><span className="lbl">Tasa cero</span><span className="val"><Money amount={b.byKind.cuota} currency={base} compact /></span></div>
        </div>
        <div className="divider" />
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="card-label">Presupuesto usado</span>
          <span className="spacer" />
          <span className="num" style={{ fontWeight: 600 }}>
            {Number.isFinite(b.usage) ? `${Math.round(b.usage * 100)}%` : '—'}
          </span>
          <span className="card-label">de <Money amount={b.budget} currency={base} compact /></span>
        </div>
        <Progress value={b.usage} tone={status.tone === 'green' ? 'purple' : status.tone} />
        {b.budget === 0 && <div style={{ fontSize: 12.5, color: 'var(--muted)', marginTop: 10 }}>Registrá tus ingresos de la quincena para ver cuánto te queda.</div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="actions">
          {ACTIONS.map((a) => (
            <button key={a.kind} className="action" onClick={() => open({ kind: data.cards.length || a.kind !== 'payment' ? a.kind : 'card' })}>
              <span className="icon-btn glass"><a.icon /></span>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      <div className="section-title">
        Tus tarjetas
        <button className="pill-btn glass" onClick={() => open({ kind: 'card' })}>
          <Plus /> Agregar
        </button>
      </div>
      {data.cards.length === 0 ? (
        <button className="card" style={{ width: '100%', textAlign: 'center', color: 'var(--muted)', padding: 28 }} onClick={() => open({ kind: 'card' })}>
          Agregá tu primera tarjeta con su día de cierre y de pago.
        </button>
      ) : (
        <div className="carousel">
          {summaries.map((s) => (
            <button key={s.card.id} onClick={() => goTo('pagos')} style={{ textAlign: 'left' }}>
              <CreditCard card={s.card} label={`A pagar · vence ${dayInMonthLabel(month, s.card.paymentDay)}`} amount={s.owedBase} currency={base} />
            </button>
          ))}
        </div>
      )}

      <History data={data} month={month} />
    </>
  )
}

function History({ data, month }: { data: AppData; month: MonthKey }) {
  const setMonth = useUi((s) => s.setMonth)
  const months = useMemo(() => Array.from({ length: 6 }, (_, i) => addMonths(month, i - 5)), [month])
  const rows = useMemo(() => months.map((m) => ({ m, ...monthBalance(data, m) })), [data, months])
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expenses]))
  return (
    <div className="card" style={{ marginTop: 4 }}>
      <div className="card-head">
        <span className="title">Últimos 6 meses</span>
        <div className="legend">
          <span><i style={{ background: '#c8c4f7' }} />Ingresos</span>
          <span><i style={{ background: 'var(--purple)' }} />Gastos</span>
        </div>
      </div>
      <div className="bars">
        {rows.map((r) => (
          <button key={r.m} className={`bar-col ${r.m === month ? 'on' : ''}`} onClick={() => setMonth(r.m)} aria-label={r.m}>
            <div className="bar-pair">
              <span className="bar in" style={{ height: `${(r.income / max) * 100}%` }} />
              <span className="bar out" style={{ height: `${(r.expenses / max) * 100}%` }} />
            </div>
            <span className="bar-lbl">{monthShort(r.m)}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
