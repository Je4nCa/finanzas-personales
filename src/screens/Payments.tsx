import { Check, ChevronDown, CreditCard as CardIcon } from 'lucide-react'
import { useState } from 'react'
import { dateLabel, dayInMonthLabel, monthLabel, todayKey } from '../domain/dates'
import { toBase, type CardMonthSummary } from '../domain/finance'
import type { Currency } from '../domain/types'
import { cardSwatch, Empty, Money, MonthNav, Progress } from '../components/ui'
import { newId, useData } from '../store/store'
import { useOverlay } from '../store/ui'
import { useMonthView } from '../store/useMonth'

const KIND = { variable: '', fijo: 'Fijo', cuota: 'Cuota' } as const

export function Payments() {
  const { data, month, summaries, balance } = useMonthView()
  const open = useOverlay((s) => s.open)
  const base = data.settings.baseCurrency
  const totalOwed = summaries.reduce((t, s) => t + s.owedBase, 0)
  const owedUSD = summaries.reduce((t, s) => t + s.owed.USD, 0)
  const owedCRC = summaries.reduce((t, s) => t + s.owed.CRC, 0)

  return (
    <>
      <MonthNav hint="Mes de pago" />
      <div className="card kpi">
        <div className="kpi-top">
          <span className="icon-tile"><CardIcon /></span>Total a pagar en {monthLabel(month)}
        </div>
        <div className="kpi-value" style={{ fontSize: 30 }}><Money amount={totalOwed} currency={base} /></div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          {owedCRC > 0 && <span className="chip purple"><Money amount={owedCRC} currency="CRC" /></span>}
          {owedUSD > 0 && <span className="chip purple"><Money amount={owedUSD} currency="USD" /></span>}
          {totalOwed === 0 && summaries.some((s) => s.billedBase > 0) && <span className="chip green"><Check size={12} /> Todo pagado</span>}
        </div>
        {balance.cash > 0 && (
          <div className="kpi-foot" style={{ marginTop: 12 }}>
            <span>Además en efectivo / débito</span>
            <Money amount={balance.cash} currency={base} />
          </div>
        )}
      </div>

      {data.cards.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <Empty
            text="Agregá una tarjeta para ver cuánto le debés cada mes."
            action={<button className="pill-btn dark" onClick={() => open({ kind: 'card' })}>Agregar tarjeta</button>}
          />
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 12 }}>
          {summaries.map((s) => <CardPaymentCard key={s.card.id} s={s} />)}
        </div>
      )}
    </>
  )
}

function CardPaymentCard({ s }: { s: CardMonthSummary }) {
  const { data, month } = useMonthView()
  const { upsert, installments, toggleInstallmentPaid } = useData()
  const { open, showToast } = useOverlay()
  const [expanded, setExpanded] = useState(false)
  const base = data.settings.baseCurrency
  const payments = data.payments.filter((p) => p.cardId === s.card.id && p.month === month)
  const paidBase = toBase(s.paid, data.settings)
  const done = s.billedBase > 0 && s.owedBase === 0
  const currencies = (['CRC', 'USD'] as Currency[]).filter((c) => s.billed[c] > 0 || s.paid[c] > 0)

  const payAll = () => {
    const today = todayKey()
    for (const c of currencies) {
      if (s.owed[c] > 0) upsert('payments', { id: newId(), cardId: s.card.id, month, amount: s.owed[c], currency: c, date: today })
    }
    // Las cuotas de tasa cero de esta tarjeta quedan pagadas con el estado de cuenta.
    for (const c of s.charges) {
      const inst = c.kind === 'cuota' ? installments.find((i) => i.id === c.sourceId) : undefined
      if (inst && !inst.paidMonths.includes(month)) toggleInstallmentPaid(inst.id, month)
    }
    showToast(`${s.card.name} marcada como pagada`)
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="icon-tile" style={{ background: cardSwatch(s.card.theme), border: 0 }} />
        <div className="spacer">
          <div className="title">{s.card.name}</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
            Vence {dayInMonthLabel(month, s.card.paymentDay)} · cierra día {s.card.closingDay}
          </div>
        </div>
        {done ? <span className="chip green"><Check size={12} /> Pagada</span> : s.billedBase === 0 ? <span className="chip">Sin cobros</span> : null}
      </div>

      {currencies.length > 0 && (
        <>
          <div className="stats-3" style={{ margin: '4px 0 14px' }}>
            <div>
              <span className="lbl">Cobrado</span>
              {currencies.map((c) => <span key={c} className="val"><Money amount={s.billed[c]} currency={c} /></span>)}
            </div>
            <div>
              <span className="lbl">Abonado</span>
              {currencies.map((c) => <span key={c} className="val" style={{ color: 'var(--green)' }}><Money amount={s.paid[c]} currency={c} /></span>)}
            </div>
            <div>
              <span className="lbl">Pendiente</span>
              {currencies.map((c) => <span key={c} className="val" style={{ color: s.owed[c] > 0 ? 'var(--text)' : 'var(--muted)' }}><Money amount={s.owed[c]} currency={c} /></span>)}
            </div>
          </div>
          <Progress value={s.billedBase > 0 ? paidBase / s.billedBase : 0} tone="green" thin />
          {currencies.length > 1 && (
            <div className="row" style={{ marginTop: 10, fontSize: 13 }}>
              <span className="card-label">Pendiente total</span>
              <span className="spacer" />
              <strong className="num"><Money amount={s.owedBase} currency={base} /></strong>
            </div>
          )}
        </>
      )}

      {!done && s.billedBase > 0 && (
        <div className="form-actions" style={{ marginTop: 14 }}>
          <button className="pill-btn glass block" style={{ height: 42, fontSize: 14 }} onClick={() => open({ kind: 'payment', preset: { cardId: s.card.id } })}>
            Abonar
          </button>
          <button className="pill-btn dark block" style={{ height: 42, fontSize: 14 }} onClick={payAll}>
            Pagar todo
          </button>
        </div>
      )}

      {(s.charges.length > 0 || payments.length > 0) && (
        <>
          <button className="row" style={{ marginTop: 14, fontSize: 13.5, color: 'var(--text-2)', width: '100%' }} onClick={() => setExpanded(!expanded)}>
            Detalle ({s.charges.length} {s.charges.length === 1 ? 'cobro' : 'cobros'}
            {payments.length ? `, ${payments.length} ${payments.length === 1 ? 'abono' : 'abonos'}` : ''})
            <span className="spacer" />
            <ChevronDown size={18} style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
          </button>
          {expanded && (
            <div className="list" style={{ marginTop: 8 }}>
              {s.charges.map((c) => (
                <button
                  key={`${c.kind}-${c.sourceId}`}
                  className="list-item"
                  onClick={() => open({ kind: c.kind === 'variable' ? 'expense' : c.kind === 'fijo' ? 'fixed' : 'installment', id: c.sourceId })}
                >
                  <div className="li-main">
                    <div className="li-title">{c.description}</div>
                    <div className="li-sub">
                      {c.date && <span>compra {dateLabel(c.date)}</span>}
                      {KIND[c.kind] && <span className="chip">{KIND[c.kind]}{c.detail ? ` ${c.detail}` : ''}</span>}
                    </div>
                  </div>
                  <div className="li-amount"><Money amount={c.amount} currency={c.currency} /></div>
                </button>
              ))}
              {payments.map((p) => (
                <button key={p.id} className="list-item" onClick={() => open({ kind: 'payment', id: p.id })}>
                  <div className="li-main">
                    <div className="li-title">Abono</div>
                    <div className="li-sub">{dateLabel(p.date)}</div>
                  </div>
                  <div className="li-amount" style={{ color: 'var(--green)' }}>−<Money amount={p.amount} currency={p.currency} /></div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
