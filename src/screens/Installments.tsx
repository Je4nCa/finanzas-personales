import { CalendarClock, Car, Check, Landmark, Repeat, Wallet } from 'lucide-react'
import { amountsFor, cardLabel, isCredit } from '../domain/cards'
import { addMonths, monthLabel, monthShort, parseMonth } from '../domain/dates'
import { formatMoney, installmentAmount, installmentIndex, remainingDebt, sumByCurrency } from '../domain/finance'
import type { Installment, RecurringType } from '../domain/types'
import { ExpenseIcon } from '../components/logos'
import { Amounts, Empty, IconTile, MonthNav, Progress } from '../components/ui'
import { useData } from '../store/store'
import { useOverlay } from '../store/ui'
import { useMonthView } from '../store/useMonth'
import { AddButton } from './Movements'

const SECTIONS: { type: RecurringType; title: string }[] = [
  { type: 'prestamo', title: 'Préstamos y créditos' },
  { type: 'tasa_cero', title: 'Tasa cero' },
  { type: 'suscripcion', title: 'Suscripciones' },
  { type: 'otro', title: 'Otros pagos mensuales' },
]

const typeOf = (i: Installment): RecurringType => i.type ?? 'tasa_cero'

/** Préstamos, tasa cero, suscripciones y otros pagos que se repiten cada mes. */
export function Installments() {
  const { data, month } = useMonthView()
  const open = useOverlay((s) => s.open)
  const active = data.installments.filter((i) => installmentIndex(i, month) >= 0)
  const thisMonth = sumByCurrency(active.map((i) => ({ amount: installmentAmount(i, installmentIndex(i, month)), currency: i.currency })))
  const pendingThisMonth = sumByCurrency(
    active.filter((i) => !i.paidMonths.includes(month)).map((i) => ({ amount: installmentAmount(i, installmentIndex(i, month)), currency: i.currency })),
  )
  const debt = sumByCurrency(data.installments.map((i) => ({ amount: remainingDebt(i), currency: i.currency })))

  return (
    <>
      <MonthNav hint="Mes de pago" />
      <div className="grid-2">
        <div className="card kpi">
          <div className="kpi-top">
            <IconTile>
              <CalendarClock />
            </IconTile>
            Este mes
          </div>
          <div className="kpi-value">
            <Amounts items={amountsFor(thisMonth)} compact />
          </div>
          <div className="kpi-foot">
            <span>
              Falta <Amounts items={amountsFor(pendingThisMonth)} compact />
            </span>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-top">
            <IconTile>
              <Landmark />
            </IconTile>
            Deuda pendiente
          </div>
          <div className="kpi-value">
            <Amounts items={amountsFor(debt)} compact />
          </div>
          <div className="kpi-foot">
            <span>préstamos y tasa cero</span>
          </div>
        </div>
      </div>

      {data.installments.length === 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <Empty text="Agregá tus créditos, tasa cero y suscripciones para ver cada mes qué toca pagar y cuánto te falta." />
        </div>
      )}

      {SECTIONS.map(({ type, title }) => {
        const items = data.installments
          .filter((i) => typeOf(i) === type)
          // Los que tocan este mes primero.
          .sort((a, b) => Number(installmentIndex(b, month) >= 0) - Number(installmentIndex(a, month) >= 0) || a.description.localeCompare(b.description))
        if (!items.length) return null
        return (
          <section key={type}>
            <div className="section-title">{title}</div>
            <div className="stack">
              {items.map((i) => (
                <RecurringCard key={i.id} inst={i} />
              ))}
            </div>
          </section>
        )
      })}
      <AddButton label="Agregar pago mensual" onClick={() => open({ kind: 'installment' })} />
    </>
  )
}

function TypeIcon({ inst }: { inst: Installment }) {
  const t = typeOf(inst)
  if (t === 'suscripcion' || t === 'tasa_cero') return <ExpenseIcon description={inst.description} category={t === 'tasa_cero' ? 'Compras' : 'Ocio'} />
  const Icon = /carro|auto|vehicul|moto/i.test(inst.description) ? Car : t === 'prestamo' ? Landmark : Repeat
  return (
    <IconTile>
      <Icon />
    </IconTile>
  )
}

function RecurringCard({ inst }: { inst: Installment }) {
  const { data, month } = useMonthView()
  const toggle = useData((s) => s.toggleInstallmentPaid)
  const { open, showToast } = useOverlay()
  const card = data.cards.find((c) => c.id === inst.cardId)
  const idx = installmentIndex(inst, month)
  const total = inst.months
  const paidCount = inst.paidMonths.filter((m) => installmentIndex(inst, m) >= 0).length
  const paidNow = inst.paidMonths.includes(month)
  const debt = remainingDebt(inst)
  const amount = installmentAmount(inst, Math.max(0, idx))
  const finished = total != null && paidCount >= total
  const months = total != null && total <= 60 ? Array.from({ length: total }, (_, i) => addMonths(inst.firstMonth, i)) : []
  const payWith = card ? cardLabel(card) : 'Directo'
  const due = inst.dueDay && !(card && isCredit(card)) ? ` · vence día ${inst.dueDay}` : ''
  const fromAccount = !!card && !isCredit(card)

  const status = idx >= 0 ? (total != null ? `cuota ${idx + 1}/${total}` : 'cada mes') : month < inst.firstMonth ? `inicia ${monthLabel(inst.firstMonth)}` : 'terminado'

  return (
    <div className="card recurring" style={{ opacity: idx < 0 && (finished || month > inst.firstMonth) ? 0.6 : 1 }}>
      <button className="card-head" style={{ width: '100%', textAlign: 'left' }} onClick={() => open({ kind: 'installment', id: inst.id })}>
        <TypeIcon inst={inst} />
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="title">{inst.description}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            {payWith}
            {due}
            {typeOf(inst) === 'tasa_cero' ? ` · ${formatMoney(inst.total, inst.currency)} en ${total} meses` : ''}
          </div>
        </div>
        <div className="li-amount" style={{ textAlign: 'right' }}>
          <div className="num" style={{ fontWeight: 600 }}>{formatMoney(amount, inst.currency)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>{status}</div>
        </div>
      </button>

      {idx >= 0 && (
        <div className="row" style={{ marginBottom: total != null ? 12 : 0 }}>
          <span className="card-label" style={{ fontSize: 13 }}>
            {paidNow ? 'Pagado' : 'Pendiente'} en {monthLabel(month).split(' ')[0]}
          </span>
          <span className="spacer" />
          <button
            className={`pill-btn ${paidNow ? 'glass' : 'dark'}`}
            onClick={() => {
              toggle(inst.id, month)
              if (!paidNow) showToast(fromAccount ? `Pagado: se descontó de ${cardLabel(card!)}` : 'Marcado como pagado')
            }}
          >
            {paidNow ? (
              'Desmarcar'
            ) : (
              <>
                <Check /> Marcar pagado
              </>
            )}
          </button>
        </div>
      )}

      {total != null && (
        <>
          <div className="row" style={{ marginBottom: 8, fontSize: 12.5, flexWrap: 'wrap' }}>
            <span className="card-label">
              {paidCount} de {total} pagadas
              {debt > 0 && (
                <>
                  {' · falta '}
                  <strong className="num">{formatMoney(debt, inst.currency)}</strong>
                </>
              )}
            </span>
            <span className="spacer" />
            <span style={{ color: 'var(--muted)' }}>termina {monthLabel(addMonths(inst.firstMonth, total - 1))}</span>
          </div>
          <Progress value={paidCount / total} tone="green" thin />
        </>
      )}

      {months.length > 0 && (
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
      )}
      {total == null && fromAccount && (
        <div className="card-label row" style={{ fontSize: 12, marginTop: 8, gap: 6 }}>
          <Wallet size={13} /> Se descuenta de {cardLabel(card!)} al marcarlo pagado
        </div>
      )}
    </div>
  )
}
