import { accountBalance, amountsFor, cardCurrency, cardLabel, isCredit, KIND_LABEL } from '../domain/cards'
import { addMonths, currentMonth, dayInMonthLabel, monthLabel, parseDate, todayKey } from '../domain/dates'
import { cardSummaries, chargesForMonth, paymentMonthFor, sumByCurrency } from '../domain/finance'
import type { AppData, Card } from '../domain/types'
import { Amounts, CreditCard, Empty } from '../components/ui'
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
  const owed = cardSummaries({ ...data, cards: [c] }, nextPay)[0].owed
  return (
    <button className="card" style={{ textAlign: 'left', padding: 12 }} onClick={onOpen}>
      <CreditCard card={c} label={`Próximo pago · ${dayInMonthLabel(nextPay, c.paymentDay)}`} amounts={amountsFor(owed, cardCurrency(c))} />
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
  const open = useOverlay((s) => s.open)
  const month = currentMonth()
  const preferred = cardCurrency(c)
  const available = accountBalance(data, c)
  const spent = sumByCurrency(chargesForMonth(data, month).filter((x) => x.cardId === c.id))
  const kind = KIND_LABEL[c.kind ?? 'credit']
  const negative = available.CRC < 0 || available.USD < 0
  return (
    <div className="card" style={{ padding: 12 }}>
      <button style={{ width: '100%', textAlign: 'left' }} onClick={onOpen} aria-label={`Editar ${cardLabel(c)}`}>
        <CreditCard card={c} label={`${kind} · disponible`} amounts={amountsFor(available, preferred)} />
      </button>
      <div className="row" style={{ marginTop: 10, fontSize: 13, flexWrap: 'wrap' }}>
        <span className="card-label">
          Gastado en {monthLabel(month).split(' ')[0]}: <Amounts items={amountsFor(spent, preferred)} compact />
        </span>
        <span className="spacer" />
        <button className="pill-btn glass" onClick={() => open({ kind: 'balance', id: c.id })}>
          Ajustar disponible
        </button>
      </div>
      {negative && <div className="chip red" style={{ marginTop: 8, whiteSpace: 'normal' }}>El disponible quedó en negativo: revisá si falta registrar un ingreso o ajustalo.</div>}
      {c.nickname && <div className="card-label nickname-note">En el banco: {c.name}</div>}
    </div>
  )
}
