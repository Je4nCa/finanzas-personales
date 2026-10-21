import { addMonths, currentMonth } from './domain/dates'
import type { AppData } from './domain/types'

/** Subir este número hace que la vista previa recargue los ejemplos. */
export const DEMO_VERSION = 5

/** Datos de ejemplo para la vista previa (artifact); nunca se cargan en la app instalada. */
export function demoData(): AppData {
  const m = currentMonth()
  const prev = addMonths(m, -1)
  const d = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`
  return {
    cards: [
      { id: 'c1', name: 'BAC Visa', lastFour: '1327', closingDay: 20, paymentDay: 5, theme: 0 },
      { id: 'c2', name: 'Wink Mastercard', lastFour: '8841', closingDay: 28, paymentDay: 22, theme: 4 },
    ],
    expenses: [
      { id: 'e1', description: 'Automercado', amount: 48500, currency: 'CRC', date: d(prev, 12), cardId: 'c1', category: 'Súper', scope: 'casa' },
      { id: 'e2', description: 'Gasolina', amount: 30000, currency: 'CRC', date: d(prev, 18), cardId: 'c1', category: 'Transporte', scope: 'pareja' },
      { id: 'e3', description: 'Amazon', amount: 64.99, currency: 'USD', date: d(prev, 3), cardId: 'c1', category: 'Compras' },
      { id: 'e4', description: 'Restaurante', amount: 22000, currency: 'CRC', date: d(prev, 14), cardId: 'c2', category: 'Comida', scope: 'pareja' },
      { id: 'e5', description: 'Farmacia', amount: 12500, currency: 'CRC', date: d(m, 8), cardId: null, category: 'Salud' },
      { id: 'e6', description: 'Uber', amount: 4800, currency: 'CRC', date: d(m, 10), cardId: 'c1', category: 'Transporte' },
      { id: 'e7', description: 'Apple iCloud', amount: 2.99, currency: 'USD', date: d(prev, 9), cardId: 'c1', category: 'Ocio' },
      { id: 'e8', description: 'PlayStation Store', amount: 69.99, currency: 'USD', date: d(prev, 16), cardId: 'c2', category: 'Ocio' },
    ],
    fixed: [],
    installments: [
      { id: 'f1', type: 'suscripcion', description: 'Netflix', total: 0, monthly: 15.49, currency: 'USD', cardId: 'c1', months: null, firstMonth: addMonths(m, -9), paidMonths: [] },
      { id: 'f2', type: 'suscripcion', description: 'Internet Kölbi', total: 0, monthly: 24900, currency: 'CRC', cardId: 'c2', months: null, firstMonth: addMonths(m, -9), paidMonths: [], scope: 'casa' },
      { id: 'f4', type: 'suscripcion', description: 'Claude Pro', total: 0, monthly: 20, currency: 'USD', cardId: 'c1', months: null, firstMonth: addMonths(m, -3), paidMonths: [] },
      { id: 'f3', type: 'suscripcion', description: 'Spotify', total: 0, monthly: 5.99, currency: 'USD', cardId: 'c1', months: null, firstMonth: addMonths(m, -7), paidMonths: [] },
      { id: 'l1', type: 'prestamo', description: 'Crédito del carro', total: 4500000, monthly: 150000, currency: 'CRC', cardId: null, months: 30, firstMonth: addMonths(m, -6), dueDay: 15, paidMonths: [1, 2, 3, 4, 5, 6].map((k) => addMonths(m, -k)) },
      { id: 'i1', description: 'iPhone 17', total: 1199, currency: 'USD', cardId: 'c1', months: 12, firstMonth: addMonths(m, -4), paidMonths: [1, 2, 3, 4].map((k) => addMonths(m, -k)) },
      { id: 'i2', description: 'Refrigeradora', total: 540000, currency: 'CRC', cardId: 'c2', months: 6, firstMonth: addMonths(m, -1), paidMonths: [addMonths(m, -1)], scope: 'casa' },
    ],
    payments: [{ id: 'p1', cardId: 'c2', month: m, amount: 50000, currency: 'CRC', date: d(m, 6) }],
    incomes: [
      { id: 'n1', description: 'Salario', amount: 425000, currency: 'CRC', date: d(m, 15), fortnight: 1 },
      { id: 'n2', description: 'Salario', amount: 425000, currency: 'CRC', date: d(m, 28), fortnight: 2 },
      { id: 'n3', description: 'Salario', amount: 425000, currency: 'CRC', date: d(prev, 15), fortnight: 1 },
      { id: 'n4', description: 'Salario', amount: 425000, currency: 'CRC', date: d(prev, 28), fortnight: 2 },
    ],
    settings: { userName: 'Jean', theme: 'system', baseCurrency: 'CRC', exchangeRate: 510, monthlyBudget: 0 },
  }
}
