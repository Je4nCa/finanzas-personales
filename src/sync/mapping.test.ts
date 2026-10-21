import { describe, expect, it } from 'vitest'
import { emptyData } from '../store/store'
import { diff, fromRow, toRow } from './mapping'

describe('mapeo de filas', () => {
  it('ida y vuelta de un gasto', () => {
    const e = { id: 'e1', description: 'Pali', amount: 25000, currency: 'CRC' as const, date: '2026-10-20', cardId: 'c1', category: 'Súper' }
    const row = toRow(e)
    expect(row).toEqual({ id: 'e1', description: 'Pali', amount: 25000, currency: 'CRC', date: '2026-10-20', card_id: 'c1', category: 'Súper' })
    // PostgREST devuelve numeric como string y agrega columnas del servidor.
    expect(fromRow('expenses', { ...row, amount: '25000.00', user_id: 'u', updated_at: 'x', deleted_at: null })).toEqual(e)
  })

  it('red/banco sin elegir viajan como null y vuelven como ausentes', () => {
    const c = { id: 'c', name: 'BAC Visa', lastFour: '1327', closingDay: 20, paymentDay: 5, theme: 0 }
    const row = toRow({ ...c, network: undefined })
    expect(row.network).toBeNull()
    expect(fromRow('cards', { ...row, bank: null })).toEqual(c)
  })

  it('cuotas pagadas como arreglo', () => {
    const i = { id: 'i', description: 'iPhone', total: 1199, currency: 'USD' as const, cardId: null, months: 12, firstMonth: '2026-06', paidMonths: ['2026-06'] }
    expect(fromRow('installments', { ...toRow(i), total: '1199.00' })).toEqual(i)
  })
})

describe('pagos mensuales', () => {
  it('suscripción sin fin: monthly numérico, months null, sin due_day', () => {
    const row = { id: 's', type: 'suscripcion', description: 'Netflix', total: '0.00', monthly: '15.49', currency: 'USD', card_id: null, months: null, first_month: '2026-01', due_day: null, paid_months: [], user_id: 'u', updated_at: 'x', deleted_at: null }
    expect(fromRow('installments', row)).toEqual({ id: 's', type: 'suscripcion', description: 'Netflix', total: 0, monthly: 15.49, currency: 'USD', cardId: null, months: null, firstMonth: '2026-01', paidMonths: [] })
  })
})

describe('diff', () => {
  it('detecta altas, ediciones y bajas', () => {
    const a = emptyData()
    const e1 = { id: 'e1', description: 'A', amount: 1, currency: 'CRC' as const, date: '2026-10-01', cardId: null, category: 'Otros' }
    const e2 = { ...e1, id: 'e2' }
    a.expenses = [e1, e2]
    const b = { ...a, expenses: [{ ...e1, amount: 2 }, { ...e1, id: 'e3' }] }
    expect(diff(a, b)).toEqual([
      { collection: 'expenses', id: 'e1', op: 'upsert' },
      { collection: 'expenses', id: 'e3', op: 'upsert' },
      { collection: 'expenses', id: 'e2', op: 'delete' },
    ])
  })

  it('sin cambios no genera nada', () => {
    const a = emptyData()
    expect(diff(a, { ...a })).toEqual([])
  })
})
