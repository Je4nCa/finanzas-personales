import { addMonths, currentMonth, dayInMonthLabel, monthLabel, parseDate, todayKey } from '../domain/dates'
import { cardSummaries, paymentMonthFor } from '../domain/finance'
import { CreditCard, Empty } from '../components/ui'
import { useAppData } from '../store/store'
import { useOverlay } from '../store/ui'
import { AddButton } from './Movements'

export function Cards() {
  const data = useAppData()
  const open = useOverlay((s) => s.open)
  const today = todayKey()
  const todayDay = parseDate(today).day

  return (
    <>
      <div className="section-title" style={{ marginTop: 4 }}>Mis tarjetas</div>
      {data.cards.length === 0 ? (
        <div className="card">
          <Empty text="Cada tarjeta tiene su día de cierre y de pago. Con eso la app sabe en qué mes se cobra cada compra." />
        </div>
      ) : (
        <div className="stack">
          {data.cards.map((c) => {
            // Próximo vencimiento que aún no pasó.
            const nextPay = todayDay <= c.paymentDay ? currentMonth() : addMonths(currentMonth(), 1)
            const owed = cardSummaries({ ...data, cards: [c] }, nextPay)[0].owedBase
            return (
              <button key={c.id} className="card" style={{ textAlign: 'left', padding: 12 }} onClick={() => open({ kind: 'card', id: c.id })}>
                <CreditCard card={c} label={`Próximo pago · ${dayInMonthLabel(nextPay, c.paymentDay)}`} amount={owed} currency={data.settings.baseCurrency} />
                <div className="stats-3" style={{ marginTop: 12 }}>
                  <div><span className="lbl">Cierre</span><span className="val">Día {c.closingDay}</span></div>
                  <div><span className="lbl">Pago</span><span className="val">Día {c.paymentDay}</span></div>
                  <div>
                    <span className="lbl">Compras de hoy</span>
                    <span className="val" style={{ textTransform: 'capitalize' }}>{monthLabel(paymentMonthFor(c, today)).split(' ')[0]}</span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      <AddButton label="Agregar tarjeta" onClick={() => open({ kind: 'card' })} />
    </>
  )
}
