import { useState } from 'react'
import { accountBalance, cardLabel, fixedCurrency } from '../domain/cards'
import { formatMoney } from '../domain/finance'
import type { Currency } from '../domain/types'
import { useData } from '../store/store'
import { useOverlay, type SheetState } from '../store/ui'
import { Field, MoneyInput, Sheet } from './ui'

/** Fijar el disponible real de una tarjeta de débito o cuenta; desde ahora suman ingresos y restan gastos. */
export function BalanceSheet({ id }: SheetState) {
  const { cards, expenses, incomes, upsert } = useData()
  const { close, showToast } = useOverlay()
  const card = cards.find((c) => c.id === id)
  const current = card ? accountBalance({ expenses, incomes }, card) : { CRC: 0, USD: 0 }
  const only = card ? fixedCurrency(card) : null
  const currencies: Currency[] = only ? [only] : ['CRC', 'USD']
  const [values, setValues] = useState<Record<Currency, string>>({ CRC: String(current.CRC), USD: String(current.USD) })
  if (!card) return null

  const save = () => {
    const balances: Partial<Record<Currency, number>> = {}
    for (const c of currencies) balances[c] = Math.round((parseFloat(values[c]) || 0) * 100) / 100
    upsert('cards', { ...card, balances, balanceAt: new Date().toISOString() })
    close()
    showToast(`Disponible de ${cardLabel(card)} actualizado`)
  }

  return (
    <Sheet title={`Disponible · ${cardLabel(card)}`} onClose={close}>
      <div className="form">
        {currencies.map((c) => (
          <Field key={c} label={currencies.length > 1 ? (c === 'CRC' ? 'En colones' : 'En dólares') : 'Lo que tenés ahora'}>
            <MoneyInput amount={values[c]} currency={c} locked onAmount={(v) => setValues((s) => ({ ...s, [c]: v }))} onCurrency={() => {}} autoFocus={c === currencies[0]} />
          </Field>
        ))}
        <p className="fine-print" style={{ marginTop: 0 }}>
          La app calcula {currencies.map((c) => formatMoney(current[c], c)).join(' y ')}. Si tu banco dice otra cosa, escribí el monto real: desde este momento los
          ingresos a esta cuenta suman y los gastos con ella restan.
        </p>
        <button className="pill-btn dark block" onClick={save}>
          Guardar disponible
        </button>
      </div>
    </Sheet>
  )
}
