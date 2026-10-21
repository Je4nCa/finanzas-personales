import { describe, expect, it } from 'vitest'
import { parseExpense, suggestFor, type ParseContext } from './parseExpense'

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

  it('reconoce la tarjeta por su apodo', () => {
    const cards = [...ctx.cards, { id: 'nk', name: 'BAC Credomatic Visa', nickname: 'Morada', lastFour: '', closingDay: 1, paymentDay: 15, theme: 0 }]
    expect(parseExpense('gasolina 20 mil con la morada', { ...ctx, cards })).toMatchObject({ cardId: 'nk', description: 'Gasolina' })
  })

  it('sin moneda dicha usa la de la tarjeta', () => {
    const cards = ctx.cards.map((c) => (c.id === 'bac' ? { ...c, currency: 'CRC' as const } : c))
    expect(parseExpense('Netflix 15 con la BAC', { ...ctx, cards }).currency).toBe('CRC')
    expect(parseExpense('Netflix 15 dólares con la BAC', { ...ctx, cards }).currency).toBe('USD')
  })

  it('el apodo gana sobre el nombre del banco', () => {
    const cards = [
      { id: 'wm', name: 'Wink Mastercard', lastFour: '', closingDay: 28, paymentDay: 22, theme: 0 },
      { id: 'wa', name: 'Cuenta Wink', nickname: 'Wink', kind: 'account' as const, lastFour: '', closingDay: 1, paymentDay: 1, theme: 1 },
    ]
    expect(parseExpense('súper 15 mil con la Wink', { ...ctx, cards }).cardId).toBe('wa')
    expect(parseExpense('súper 15 mil con la Wink Mastercard', { ...ctx, cards }).cardId).toBe('wm')
  })

  it('miles con coma y últimos 4 dígitos', () => {
    expect(p('Ferretería EPA 32,000 con la 8841')).toMatchObject({ amount: 32000, cardId: 'bcr', category: 'Hogar', description: 'Ferretería EPA' })
  })

  it('tipo de gasto por frase', () => {
    expect(p('cena 18 mil en pareja con la BAC')).toMatchObject({ description: 'Cena', scope: 'pareja', cardId: 'bac', amount: 18000 })
    expect(p('pali 30 mil para la casa')).toMatchObject({ description: 'Pali', scope: 'casa' })
    expect(p('cine 7 mil').scope).toBe('personal')
  })

  it('tipo de gasto del historial', () => {
    const history = [{ ...ctx.history[0], scope: 'casa' as const }]
    expect(parseExpense('pali 12 mil', { ...ctx, history }).scope).toBe('casa')
  })

  it('categorías con nombres abreviados del banco', () => {
    const cat = (d: string) => suggestFor(d, []).category
    expect(cat('Multimercado AM PM Cenada')).toBe('Súper')
    expect(cat('Panad El Buen Pastor')).toBe('Comida')
    expect(cat('Servicentro San Juan')).toBe('Transporte')
    expect(cat('Avenida Parqueos')).toBe('Transporte')
    expect(cat('Pet Shop 2 Go')).toBe('Mascotas')
    expect(cat('Coffee Bar Auxis CR')).toBe('Comida')
    expect(cat('On Side Sport Bar')).toBe('Ocio')
    expect(cat('Unopetrol Barreal')).toBe('Transporte')
  })

  it('comercios que por defecto son en pareja', () => {
    const scope = (d: string) => suggestFor(d, []).scope
    for (const d of ['Servicentro San Juan', 'Unopetrol Cariari', 'Pricesmart Heredia', 'Maxipali Santa Barbara Oc', 'Global Via Ruta 27', 'Pet Shop 2 Go', 'La Vete Cariari']) {
      expect(scope(d), d).toBe('pareja')
    }
    expect(scope('Pali Heredia')).toBeUndefined()
    expect(scope('Subway Liberia')).toBeUndefined()
    // Por voz también, salvo que se diga otra cosa.
    expect(p('gasolina 20 mil').scope).toBe('pareja')
    expect(p('gasolina 20 mil personal').scope).toBe('personal')
  })

  it('una corrección del usuario gana sobre la regla del comercio', () => {
    const history = [{ ...ctx.history[0], description: 'Pet Shop 2 Go', scope: 'casa' as const }]
    expect(suggestFor('Pet Shop 2 Go', history).scope).toBe('casa')
  })

  describe('ingresos', () => {
    it('frase con empresa', () => {
      expect(p('Me ingresó 500 mil por mi empresa de Montevo')).toMatchObject({
        kind: 'income',
        description: 'Montevo',
        amount: 500000,
        currency: 'CRC',
        fortnight: 2,
      })
    })

    it('dólares y "me cayó la plata"', () => {
      expect(p('me cayó la plata de Montevo, 1200 dólares')).toMatchObject({ kind: 'income', description: 'Montevo', amount: 1200, currency: 'USD' })
    })

    it('salario queda como descripción y la quincena sale de la fecha', () => {
      expect(parseExpense('salario 425 mil', { ...ctx, today: '2026-10-15' })).toMatchObject({ kind: 'income', description: 'Salario', amount: 425000, fortnight: 1 })
    })

    it('me pagaron + sinpe', () => {
      expect(p('me pagaron 30 mil por SINPE del cliente de diseño')).toMatchObject({ kind: 'income', amount: 30000, description: 'Diseño' })
    })

    it('un gasto con "pagué" sigue siendo gasto', () => {
      expect(p('pagué 15 mil de la luz').kind).toBe('expense')
    })

    it('ingreso a futuro con fecha: queda programado', () => {
      expect(p('me van a pagar 134 mil de Montevo Studio el 1 de noviembre')).toMatchObject({
        kind: 'income',
        description: 'Montevo Studio',
        amount: 134000,
        date: '2026-11-01',
        status: 'expected',
        fortnight: 1,
      })
      // La fecha antes del monto no confunde el "1" con el monto.
      expect(p('el 1 de noviembre me pagan 60 mil de Montevo')).toMatchObject({ amount: 60000, date: '2026-11-01', status: 'expected', description: 'Montevo' })
    })

    it('ingreso de hoy o pasado: recibido', () => {
      expect(p('me pagaron 30 mil de Montevo ayer')).toMatchObject({ status: 'received', date: '2026-10-19' })
      expect(p('salario 400 mil mañana')).toMatchObject({ status: 'expected', date: '2026-10-21' })
    })

    it('fechas con mes y año', () => {
      expect(p('gasolina 20 mil el 5 de octubre').date).toBe('2026-10-05')
      expect(p('me pagan 100 mil el 15 de enero').date).toBe('2027-01-15')
      expect(p('me pagan 100 mil el 15 de enero de 2026').date).toBe('2026-01-15')
    })

    it('usa el nombre de un ingreso anterior', () => {
      const incomes = [{ id: 'i', description: 'Montevo', amount: 1, currency: 'USD' as const, date: '2026-09-30', fortnight: 2 as const }]
      expect(parseExpense('me ingresaron 900 de montevo', { ...ctx, incomes })).toMatchObject({ kind: 'income', description: 'Montevo', currency: 'USD' })
    })
  })
})
