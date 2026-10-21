import { describe, expect, it } from 'vitest'
import { cardSummaries, chargesForMonth, installmentAmount, monthBalance, paymentMonthFor } from './finance'
import type { AppData } from './types'

describe('paymentMonthFor', () => {
  // Cierra el 20, paga el 5 del mes siguiente.
  const card = { closingDay: 20, paymentDay: 5 }

  it('compra antes del cierre se paga el mes siguiente', () => {
    expect(paymentMonthFor(card, '2026-10-10')).toBe('2026-11')
  })
  it('compra el día del cierre entra en ese estado', () => {
    expect(paymentMonthFor(card, '2026-10-20')).toBe('2026-11')
  })
  it('compra después del cierre salta un estado', () => {
    expect(paymentMonthFor(card, '2026-10-22')).toBe('2026-12')
  })
  it('cruza el año', () => {
    expect(paymentMonthFor(card, '2026-12-25')).toBe('2027-02')
  })
  it('si el pago es el mismo mes del cierre', () => {
    const c = { closingDay: 2, paymentDay: 25 }
    expect(paymentMonthFor(c, '2026-10-01')).toBe('2026-10')
    expect(paymentMonthFor(c, '2026-10-03')).toBe('2026-11')
  })
  it('cierre 31 en febrero usa el último día', () => {
    const c = { closingDay: 31, paymentDay: 15 }
    expect(paymentMonthFor(c, '2026-02-28')).toBe('2026-03')
  })
})

describe('installmentAmount', () => {
  it('la última cuota absorbe el redondeo', () => {
    const inst = { id: 'i', description: '', total: 100, currency: 'USD' as const, cardId: null, months: 3, firstMonth: '2026-01', paidMonths: [] }
    expect([0, 1, 2].map((i) => installmentAmount(inst, i))).toEqual([33.33, 33.33, 33.34])
  })
})

describe('resumen del mes', () => {
  const data: AppData = {
    cards: [{ id: 'c1', name: 'Visa', lastFour: '1327', closingDay: 20, paymentDay: 5, theme: 0 }],
    expenses: [
      { id: 'e1', description: 'Súper', amount: 20000, currency: 'CRC', date: '2026-10-10', cardId: 'c1', category: 'Comida' },
      { id: 'e2', description: 'Amazon', amount: 50, currency: 'USD', date: '2026-10-15', cardId: 'c1', category: 'Compras' },
      { id: 'e3', description: 'Después del cierre', amount: 10, currency: 'USD', date: '2026-10-25', cardId: 'c1', category: 'Otros' },
    ],
    fixed: [{ id: 'f1', description: 'Netflix', amount: 10, currency: 'USD', cardId: 'c1', startMonth: '2026-01', endMonth: null }],
    installments: [{ id: 'i1', description: 'iPhone', total: 1200, currency: 'USD', cardId: 'c1', months: 12, firstMonth: '2026-06', paidMonths: [] }],
    payments: [{ id: 'p1', cardId: 'c1', month: '2026-11', amount: 60, currency: 'USD', date: '2026-10-30' }],
    incomes: [{ id: 'n1', description: 'Salario', amount: 500000, currency: 'CRC', date: '2026-11-15', fortnight: 1 }],
    settings: { userName: '', theme: 'system', baseCurrency: 'CRC', exchangeRate: 500, monthlyBudget: 0 },
  }

  it('agrupa por mes de pago, no por fecha de compra', () => {
    const ids = chargesForMonth(data, '2026-11').map((c) => c.sourceId).sort()
    expect(ids).toEqual(['e1', 'e2', 'f1', 'i1'])
  })

  it('descuenta abonos por moneda', () => {
    const [s] = cardSummaries(data, '2026-11')
    expect(s.billed).toEqual({ USD: 160, CRC: 20000 })
    expect(s.owed).toEqual({ USD: 100, CRC: 20000 })
    expect(s.owedBase).toBe(70000)
  })

  it('balance = ingresos − gastos en moneda base', () => {
    const b = monthBalance(data, '2026-11')
    expect(b.income).toBe(500000)
    expect(b.expenses).toBe(100000)
    expect(b.free).toBe(400000)
    expect(b.usage).toBeCloseTo(0.2)
  })
})
