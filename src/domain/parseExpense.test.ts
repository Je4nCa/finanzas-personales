import { describe, expect, it } from 'vitest'
import { parseExpense, type ParseContext } from './parseExpense'

const ctx: ParseContext = {
  cards: [
    { id: 'bac', name: 'BAC Visa', lastFour: '1327', closingDay: 20, paymentDay: 5, theme: 0 },
    { id: 'bcr', name: 'BCR Mastercard', lastFour: '8841', closingDay: 28, paymentDay: 22, theme: 1 },
  ],
  history: [{ id: 'h1', description: 'Pali', amount: 10000, currency: 'CRC', date: '2026-10-01', cardId: 'bcr', category: 'Súper' }],
  baseCurrency: 'CRC',
  today: '2026-10-20',
}

const p = (t: string) => parseExpense(t, ctx)

describe('parseExpense', () => {
  it('frase típica', () => {
    const r = p('25 mil en el súper con la BAC')
    expect(r).toMatchObject({ description: 'Súper', amount: 25000, currency: 'CRC', cardId: 'bac', category: 'Súper' })
  })

  it('dólares con símbolo y nombre de tarjeta en otra posición', () => {
    expect(p('Amazon $64.99 BCR')).toMatchObject({ description: 'Amazon', amount: 64.99, currency: 'USD', cardId: 'bcr', category: 'Compras' })
  })

  it('verbo, separador de miles y moneda en palabras', () => {
    expect(p('gasté 6.500 colones en almuerzo en la soda con la visa')).toMatchObject({
      description: 'Almuerzo en la soda',
      amount: 6500,
      currency: 'CRC',
      cardId: 'bac',
      category: 'Comida',
    })
  })

  it('números en palabras', () => {
    expect(p('gasolina veinticinco mil quinientos').amount).toBe(25500)
    expect(p('treinta y cinco dólares de Uber')).toMatchObject({ amount: 35, currency: 'USD', description: 'Uber', category: 'Transporte' })
  })

  it('"una pizza" no es un monto', () => {
    expect(p('una pizza 12 mil')).toMatchObject({ amount: 12000, description: 'Pizza', category: 'Comida' })
  })

  it('aprende del historial: categoría y tarjeta', () => {
    expect(p('pali 18 mil')).toMatchObject({ description: 'Pali', category: 'Súper', cardId: 'bcr', amount: 18000 })
  })

  it('efectivo y fecha relativa', () => {
    expect(p('farmacia 8 rojos en efectivo ayer')).toMatchObject({
      description: 'Farmacia',
      amount: 8000,
      currency: 'CRC',
      cardId: null,
      category: 'Salud',
      date: '2026-10-19',
    })
  })

  it('monto chico sin moneda se toma como dólares', () => {
    expect(p('Netflix 15.49').currency).toBe('USD')
  })

  it('sin tarjeta mencionada queda sin definir', () => {
    expect(p('cine 7 mil').cardId).toBeUndefined()
  })

  it('reconoce la tarjeta por el banco elegido', () => {
    const cards = [...ctx.cards, { id: 'wk', name: 'Mi tarjeta', lastFour: '', closingDay: 1, paymentDay: 15, theme: 2, bank: 'wink' as const }]
    expect(parseExpense('Spotify 5.99 dólares con la Wink', { ...ctx, cards })).toMatchObject({ description: 'Spotify', cardId: 'wk', category: 'Ocio', currency: 'USD' })
  })

  it('miles con coma y últimos 4 dígitos', () => {
    expect(p('Ferretería EPA 32,000 con la 8841')).toMatchObject({ amount: 32000, cardId: 'bcr', category: 'Hogar', description: 'Ferretería EPA' })
  })
})
