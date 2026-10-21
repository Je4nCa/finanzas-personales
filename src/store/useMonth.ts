import { useMemo } from 'react'
import { addMonths } from '../domain/dates'
import { cardSummaries, chargesForMonth, monthBalance } from '../domain/finance'
import { useAppData, useUi } from './store'

/** Datos calculados del mes seleccionado (cobros, balance, saldos por tarjeta). */
export function useMonthView() {
  const data = useAppData()
  const month = useUi((s) => s.month)
  return useMemo(() => {
    const charges = chargesForMonth(data, month)
    const prevMonth = addMonths(month, -1)
    return {
      data,
      month,
      charges,
      balance: monthBalance(data, month, charges),
      prevBalance: monthBalance(data, prevMonth),
      summaries: cardSummaries(data, month, charges),
    }
  }, [data, month])
}
