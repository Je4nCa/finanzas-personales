import { isCredit, KIND_LABEL } from '../domain/cards'
import { addMonths, currentMonth, dayInMonthLabel, monthLabel, parseDate, todayKey } from '../domain/dates'
import { cardSummaries, chargesForMonth, paymentMonthFor, sumByCurrency, toBase } from '../domain/finance'
import type { AppData, Card } from '../domain/types'
import { CreditCard, Empty } from '../components/ui'
import { useAppData } from '../store/store'
import { useOverlay } from '../store/ui'
import { AddButton } from './Movements'

export function Cards() {
  const data = useAppData()
  const open = useOverlay((s) => s.open)
  const credit = data.cards.filter(isCredit)
  const other = data.cards.filter((c) => !isCredit(c))

  return (
    <>
      <div className="section-title" style={{ marginTop: 4 }}>Tarjetas de crédito</div>
      {credit.length === 0 ? (
        <div className="card">
          <Empty text="Cada tarjeta de crédito tiene su día de cierre y de pago. Con eso la app sabe en qué mes se cobra cada compra." />
        </div>
      ) : (
        <div className="stack">
          {credit.map((c) => (
            <CreditCardItem key={c.id} card={c} data={data} onOpen={() => open({ kind: 'card', id: c.id })} />
          ))}
        </div>
      )}

      {other.length > 0 && (
        <>
          <div className="section-title">Débito y cuentas</div>
          <div className="stack">
            {other.map((c) => (
              <DebitItem key={c.id} card={c} data={data} onOpen={() => open({ kind: 'card', id: c.id })} />
            ))}
          </div>
        </>
      )}
      <AddButton label="Agregar tarjeta o cuenta" onClick={() => open({ kind: 'card' })} />
    </>
  )
}

function CreditCardItem({ card: c, data, onOpen }: { card: Card; data: AppData; onOpen: () => void }) {
  const today = todayKey()
  // Próximo vencimiento que aún no pasó.
  const nextPay = parseDate(today).day <= c.paymentDay ? currentMonth() : addMonths(currentMonth(), 1)
  const owed = cardSummaries({ ...data, cards: [c] }, nextPay)[0].owedBase
  return (
    <button className="card" style={{ textAlign: 'left', padding: 12 }} onClick={onOpen}>
      <CreditCard card={c} label={`Próximo pago · ${dayInMonthLabel(nextPay, c.paymentDay)}`} amount={owed} currency={data.settings.baseCurrency} />
      <div className="stats-3" style={{ marginTop: 12 }}>
        <div><span className="lbl">Cierre</span><span className="val">Día {c.closingDay}</span></div>
        <div><span className="lbl">Pago</span><span className="val">Día {c.paymentDay}</span></div>
        <div>
          <span className="lbl">Compras de hoy</span>
          <span className="val" style={{ textTransform: 'capitalize' }}>{monthLabel(paymentMonthFor(c, today)).split(' ')[0]}</span>
        </div>
      </div>
      {c.nickname && <div className="card-label nickname-note">En el banco: {c.name}</div>}
    </button>
  )
}

function DebitItem({ card: c, data, onOpen }: { card: Card; data: AppData; onOpen: () => void }) {
  const month = currentMonth()
  const spent = toBase(sumByCurrency(chargesForMonth(data, month).filter((x) => x.cardId === c.id)), data.settings)
  const kind = KIND_LABEL[c.kind ?? 'credit']
  return (
    <button className="card" style={{ textAlign: 'left', padding: 12 }} onClick={onOpen}>
      <CreditCard card={c} label={`${kind} · gastado en ${monthLabel(month).split(' ')[0]}`} amount={spent} currency={data.settings.baseCurrency} />
      <div className="row" style={{ marginTop: 10, fontSize: 13 }}>
        <span className="chip">{kind}</span>
        {c.nickname && <span className="card-label">En el banco: {c.name}</span>}
      </div>
    </button>
  )
}
