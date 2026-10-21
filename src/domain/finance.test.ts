import { describe, expect, it } from 'vitest'
import { amountsFor, fixedCurrency } from './cards'
import { installmentIndex, remainingDebt } from './finance'
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

  it('un mes de pago fijado por el estado de cuenta manda sobre el calculado', () => {
    const d = { ...data, expenses: [{ ...data.expenses[0], date: '2026-09-06', paymentMonth: '2026-10' }] }
    expect(chargesForMonth(d, '2026-10').map((c) => c.sourceId)).toContain('e1')
    expect(chargesForMonth(d, '2026-09').map((c) => c.sourceId)).not.toContain('e1')
  })

  it('débito y cuentas: el gasto cuenta en el mes de la compra y no aparece en Pagos', () => {
    const d: AppData = {
      ...data,
      cards: [...data.cards, { id: 'd1', name: 'Wink débito', nickname: 'Wink', kind: 'debit', lastFour: '', closingDay: 1, paymentDay: 1, theme: 0 }],
      expenses: [{ id: 'x', description: 'Café', amount: 3000, currency: 'CRC', date: '2026-10-25', cardId: 'd1', category: 'Comida' }],
    }
    expect(chargesForMonth(d, '2026-10').map((c) => c.sourceId)).toContain('x')
    expect(cardSummaries(d, '2026-10').map((s) => s.card.id)).toEqual(['c1'])
    expect(monthBalance(d, '2026-10').cash).toBe(3000)
  })

  it('montos por moneda sin convertir, la de la tarjeta primero', () => {
    expect(amountsFor({ USD: 12, CRC: 5000 })).toEqual([
      { amount: 5000, currency: 'CRC' },
      { amount: 12, currency: 'USD' },
    ])
    expect(amountsFor({ USD: 12, CRC: 5000 }, 'USD')[0]).toEqual({ amount: 12, currency: 'USD' })
    expect(amountsFor({ USD: 0, CRC: 0 }, 'USD')).toEqual([{ amount: 0, currency: 'USD' }])
    expect(fixedCurrency({ currency: 'CRC' })).toBe('CRC')
    expect(fixedCurrency({})).toBeNull()
  })

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

describe('pagos mensuales', () => {
  const base = { id: 'x', description: 'x', total: 0, currency: 'CRC' as const, cardId: null, paidMonths: [] as string[] }
  it('préstamo con cuota fija: misma cuota y deuda = cuotas pendientes', () => {
    const p = { ...base, type: 'prestamo' as const, monthly: 150000, months: 3, firstMonth: '2026-10', paidMonths: ['2026-10'] }
    expect([0, 1, 2].map((i) => installmentAmount(p, i))).toEqual([150000, 150000, 150000])
    expect(remainingDebt(p)).toBe(300000)
    expect(installmentIndex(p, '2027-01')).toBe(-1)
  })
  it('suscripción sin fin: aplica todos los meses desde el inicio y no es deuda', () => {
    const s = { ...base, type: 'suscripcion' as const, monthly: 15.49, currency: 'USD' as const, months: null, firstMonth: '2026-01' }
    expect(installmentIndex(s, '2030-06')).toBeGreaterThan(0)
    expect(installmentIndex(s, '2025-12')).toBe(-1)
    expect(remainingDebt(s)).toBe(0)
  })
})
