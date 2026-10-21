import { CalendarClock } from 'lucide-react'
import { addMonths, monthLabel, monthShort, parseMonth } from '../domain/dates'
import { formatMoney, installmentAmount, installmentIndex, sumByCurrency, toBase } from '../domain/finance'
import type { Installment } from '../domain/types'
import { ExpenseIcon } from '../components/logos'
import { Empty, IconTile, Money, MonthNav, Progress } from '../components/ui'
import { useData } from '../store/store'
import { useOverlay } from '../store/ui'
import { useMonthView } from '../store/useMonth'
import { AddButton } from './Movements'

/** Lo que falta por pagar: cuotas no marcadas como pagadas. */
function remaining(inst: Installment): number {
  let t = 0
  for (let i = 0; i < inst.months; i++) {
    if (!inst.paidMonths.includes(addMonths(inst.firstMonth, i))) t += installmentAmount(inst, i)
  }
  return t
}

export function Installments() {
  const { data, month } = useMonthView()
  const open = useOverlay((s) => s.open)
  const base = data.settings.baseCurrency
  const active = data.installments.filter((i) => installmentIndex(i, month) >= 0)
  const others = data.installments.filter((i) => installmentIndex(i, month) < 0)
  const thisMonth = toBase(sumByCurrency(active.map((i) => ({ amount: installmentAmount(i, installmentIndex(i, month)), currency: i.currency }))), data.settings)
  const debt = toBase(sumByCurrency(data.installments.map((i) => ({ amount: remaining(i), currency: i.currency }))), data.settings)

  return (
    <>
      <MonthNav hint="Mes de pago" />
      <div className="grid-2">
        <div className="card kpi">
          <div className="kpi-top"><IconTile><CalendarClock /></IconTile>Cuotas del mes</div>
          <div className="kpi-value"><Money amount={thisMonth} currency={base} compact /></div>
          <div className="kpi-foot"><span>{active.length} activas</span></div>
        </div>
        <div className="card kpi">
          <div className="kpi-top"><IconTile><CalendarClock /></IconTile>Saldo pendiente</div>
          <div className="kpi-value"><Money amount={debt} currency={base} compact /></div>
          <div className="kpi-foot"><span>en todas las cuotas</span></div>
        </div>
      </div>

      <div className="stack" style={{ marginTop: 12 }}>
        {data.installments.length === 0 && (
          <div className="card">
            <Empty text="Registrá tus compras a tasa cero para ver cada cuota mes a mes." />
          </div>
        )}
        {active.map((i) => <InstallmentCard key={i.id} inst={i} />)}
        {others.length > 0 && <div className="section-title" style={{ marginBottom: 0 }}>Fuera de este mes</div>}
        {others.map((i) => <InstallmentCard key={i.id} inst={i} />)}
      </div>
      <AddButton label="Agregar tasa cero" onClick={() => open({ kind: 'installment' })} />
    </>
  )
}

function InstallmentCard({ inst }: { inst: Installment }) {
  const { data, month } = useMonthView()
  const toggle = useData((s) => s.toggleInstallmentPaid)
  const open = useOverlay((s) => s.open)
  const card = data.cards.find((c) => c.id === inst.cardId)
  const idx = installmentIndex(inst, month)
  const paidCount = inst.paidMonths.filter((m) => installmentIndex(inst, m) >= 0).length
  const last = addMonths(inst.firstMonth, inst.months - 1)
  const months = Array.from({ length: inst.months }, (_, i) => addMonths(inst.firstMonth, i))

  return (
    <div className="card" style={{ opacity: idx < 0 && paidCount === inst.months ? 0.6 : 1 }}>
      <button className="card-head" style={{ width: '100%', textAlign: 'left' }} onClick={() => open({ kind: 'installment', id: inst.id })}>
        <ExpenseIcon description={inst.description} category="Compras" />
        <div className="spacer">
          <div className="title">{inst.description}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {card?.name ?? 'Efectivo'} · {formatMoney(inst.total, inst.currency)} en {inst.months} meses
          </div>
        </div>
        <div className="li-amount" style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontWeight: 600 }}>
            <Money amount={installmentAmount(inst, Math.max(0, idx))} currency={inst.currency} />
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>
            {idx >= 0 ? `cuota ${idx + 1}/${inst.months}` : month < inst.firstMonth ? `inicia ${monthLabel(inst.firstMonth)}` : 'terminada'}
          </div>
        </div>
      </button>

      <div className="row" style={{ marginBottom: 8, fontSize: 12.5 }}>
        <span className="card-label">{paidCount} de {inst.months} pagadas</span>
        <span className="spacer" />
        <span style={{ color: 'var(--muted)' }}>termina {monthLabel(last)}</span>
      </div>
      <Progress value={paidCount / inst.months} tone="green" thin />

      <div className="months-grid" style={{ marginTop: 14 }}>
        {months.map((m) => {
          const paid = inst.paidMonths.includes(m)
          return (
            <button
              key={m}
              className={`month-chip ${paid ? 'paid' : ''} ${m === month ? 'current' : ''}`}
              onClick={() => toggle(inst.id, m)}
              aria-label={`${monthLabel(m)}: ${paid ? 'pagada' : 'pendiente'}`}
            >
              {monthShort(m)}
              <small>{paid ? '✓' : String(parseMonth(m).year).slice(2)}</small>
            </button>
          )
        })}
      </div>
    </div>
  )
}
