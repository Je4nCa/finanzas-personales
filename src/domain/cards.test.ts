import { describe, expect, it } from 'vitest'
import { accountBalance } from './cards'
import type { Card, Expense, Income } from './types'

const card: Card = { id: 'w', name: 'Wink', kind: 'account', currency: 'CRC', lastFour: '', closingDay: 1, paymentDay: 1, theme: 0 }
const inc = (p: Partial<Income>): Income => ({ id: 'i', description: 'Salario', amount: 0, currency: 'CRC', date: '2026-10-15', fortnight: 1, accountId: 'w', ...p })
const exp = (p: Partial<Expense>): Expense => ({ id: 'e', description: 'Súper', amount: 0, currency: 'CRC', date: '2026-10-16', cardId: 'w', category: 'Súper', ...p })

describe('disponible de cuentas y débito', () => {
  it('sin ajuste: ingresos menos gastos de esa cuenta', () => {
    const b = accountBalance(
      {
        incomes: [inc({ amount: 400000 }), inc({ amount: 100, accountId: 'otra' })],
        expenses: [exp({ amount: 25000 }), exp({ amount: 999, cardId: 'otra' })],
      },
      card,
    )
    expect(b).toEqual({ CRC: 375000, USD: 0 })
  })

  it('con ajuste: parte del saldo fijado y solo cuenta lo posterior', () => {
    // Ajuste el 20 de octubre a las 10:00 (hora local): "tengo ₡300,000".
    const at = new Date(2026, 9, 20, 10, 0).toISOString()
    const c = { ...card, balances: { CRC: 300000 }, balanceAt: at }
    const later = new Date(2026, 9, 20, 18, 0).toISOString()
    const earlier = new Date(2026, 9, 20, 8, 0).toISOString()
    const b = accountBalance(
      {
        incomes: [inc({ amount: 400000, date: '2026-10-15' }), inc({ amount: 50000, date: '2026-10-30' })],
        expenses: [
          exp({ amount: 10000, date: '2026-10-19' }), // antes: ya incluido en los ₡300,000
          exp({ amount: 2000, date: '2026-10-20', createdAt: earlier }), // mismo día, antes del ajuste
          exp({ amount: 3000, date: '2026-10-20', createdAt: later }), // mismo día, después
          exp({ amount: 4000, date: '2026-10-20' }), // mismo día sin hora: se asume incluido
          exp({ amount: 5000, date: '2026-10-21' }),
        ],
      },
      c,
    )
    expect(b.CRC).toBe(300000 + 50000 - 3000 - 5000)
  })
})

describe('pagos mensuales desde una cuenta', () => {
  it('al marcar pagada la cuota de un préstamo se descuenta del disponible', () => {
    const at = new Date(2026, 9, 1, 9, 0).toISOString()
    const c = { ...card, balances: { CRC: 500000 }, balanceAt: at }
    const prestamo = {
      id: 'p', type: 'prestamo' as const, description: 'Crédito personal', total: 0, monthly: 150000, currency: 'CRC' as const,
      cardId: 'w', months: 24, firstMonth: '2026-09', dueDay: 15, paidMonths: ['2026-09', '2026-10'],
    }
    // Septiembre ya estaba incluido en el saldo fijado el 1 de octubre; octubre (día 15) se descuenta.
    expect(accountBalance({ incomes: [], expenses: [], installments: [prestamo] }, c).CRC).toBe(350000)
  })
})
