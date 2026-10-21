import { describe, expect, it } from 'vitest'
import type { Line } from './pdfText'
import { parseStatement, parseStatementAmount, parseStatementDate, readTotals } from './statements'

// Líneas sintéticas con la misma geometría que un estado de BAC (datos inventados).
const L = (...cells: [number, string][]): Line => cells.map(([x, str]) => ({ x, str }))

const bac: Line[] = [
  L([40, 'BAC CREDOMATIC']),
  L([38, 'Marca de tarjeta: VISA'], [255, 'Para presentar un reclamo']),
  L([38, 'Número de cuenta:'], [115, '************1111']),
  L([38, 'Fecha de corte: 9-OCT-26']),
  L([38, 'Fecha límite pago de contado: 24-OCT-26']),
  L([40, 'Total pago mínimo'], [219, '1,000.00'], [290, '0.00 Total pago de contado'], [485, '27,000.00'], [561, '0.00']),
  L([43, 'A) Detalle de pago del periodo']),
  L([40, '0924136009498'], [112, '23-SET-26'], [164, 'PAGO RECIBIDO...136'], [342, '5,000.00-']),
  L([43, 'B) Detalle de compras del periodo']),
  L([164, '************1111'], [317, 'TITULAR/VI']),
  L([40, '091079000605'], [114, '6-SET-26'], [164, 'PANADERIA LA ESQUINA'], [317, 'GRECIA'], [399, 'CRC'], [470, '1,000.00']),
  L([40, '091079000605'], [114, '6-SET-26'], [164, 'PANADERIA LA ESQUINA'], [317, 'GRECIA'], [399, 'CRC'], [470, '1,000.00']),
  L([40, '092624878946'], [112, '26-SET-26'], [164, 'SERVICENTRO LA RUTA'], [399, 'CRC'], [461, '19,208.00']),
  L([40, '092624878947'], [112, '27-SET-26'], [164, 'NETFLIX.COM'], [399, 'USD'], [548, '15.49']),
  L([40, '091299300901'], [112, '11-SET-26'], [164, 'PIZZERIA REEMBOLSO'], [317, 'Pozuelo'], [399, 'CRC'], [467, '2,000.00-']),
  L([164, '************2222'], [317, 'PAREJA']),
  L([40, '100679000605'], [112, '5-OCT-26'], [164, 'PET SHOP 2 GO'], [317, 'HEREDIA'], [399, 'CRC'], [470, '7,792.00']),
  L([40, 'Total de compras del periodo (del 10-SET-26 al 9-OCT-26)'], [461, '27,000.00'], [555, '15.49']),
  L([43, 'C) Detalle de intereses']),
  L([40, 'Total por concepto de intereses'], [456, '440.65'], [548, '30.51-']),
  L([43, 'G) Otras notas de crédito']),
]

describe('fechas y montos', () => {
  it('formatos de fecha', () => {
    expect(parseStatementDate('6-SET-26')).toBe('2026-09-06')
    expect(parseStatementDate('24-OCT-26')).toBe('2026-10-24')
    expect(parseStatementDate('05/03/2026')).toBe('2026-03-05')
    expect(parseStatementDate('hola')).toBeNull()
  })
  it('formatos de monto', () => {
    expect(parseStatementAmount('1,000.00')).toBe(1000)
    expect(parseStatementAmount('5,158.25-')).toBe(-5158.25)
    expect(parseStatementAmount('(30.51)')).toBe(-30.51)
    expect(parseStatementAmount('₡1.000,50')).toBe(1000.5)
    expect(parseStatementAmount('PET')).toBeNull()
  })
})

describe('BAC', () => {
  const st = parseStatement(bac)
  const [g] = st.groups

  it('reconoce la tarjeta, el corte y el mes de pago', () => {
    expect(st.bank).toBe('bac')
    expect(g).toMatchObject({ brand: 'VISA', last4s: ['1111', '2222'], closingDate: '2026-10-09', paymentDate: '2026-10-24', paymentMonth: '2026-10' })
    expect(g.payoff).toEqual({ CRC: 27000, USD: 0 })
  })

  it('lee compras, reembolsos y dólares por columna; ignora los pagos', () => {
    const compras = g.rows.filter((r) => r.section !== 'interes')
    expect(compras.map((r) => [r.description, r.amount, r.currency])).toEqual([
      ['Panaderia La Esquina', 1000, 'CRC'],
      ['Panaderia La Esquina', 1000, 'CRC'],
      ['Servicentro La Ruta', 19208, 'CRC'],
      ['Netflix.com', 15.49, 'USD'],
      ['Pizzeria Reembolso', -2000, 'CRC'],
      ['Pet Shop 2 Go', 7792, 'CRC'],
    ])
    expect(g.rows.find((r) => r.amount === -2000)?.section).toBe('credito')
  })

  it('las sumas coinciden con el total del banco', () => {
    expect(readTotals(g)).toEqual({ CRC: 27000, USD: 15.49 })
    expect(g.declaredTotals).toEqual({ CRC: 27000, USD: 15.49 })
  })

  it('líneas idénticas tienen referencias distintas (no se pierden ni se duplican al reimportar)', () => {
    const refs = g.rows.map((r) => r.ref)
    expect(new Set(refs).size).toBe(refs.length)
    expect(parseStatement(bac).groups[0].rows.map((r) => r.ref)).toEqual(refs)
  })

  it('marca las compras del adicional y el lugar', () => {
    const pet = g.rows.find((r) => r.description === 'Pet Shop 2 Go')!
    expect(pet.holder).toBe('Pareja')
    expect(pet.place).toBe('Heredia')
    expect(g.rows.find((r) => r.description === 'Netflix.com')!.holder).toBeUndefined()
  })

  it('intereses como filas aparte', () => {
    expect(g.rows.filter((r) => r.section === 'interes').map((r) => [r.amount, r.currency])).toEqual([
      [440.65, 'CRC'],
      [-30.51, 'USD'],
    ])
  })
})

describe('genérico', () => {
  it('líneas con fecha y monto; ingresos por palabras clave', () => {
    const st = parseStatement([
      L([40, 'Wink - Estado de cuenta']),
      L([40, '01/10/2026'], [120, 'DEPOSITO SALARIO EMPRESA'], [400, '500,000.00'], [480, '600,000.00']),
      L([40, '03/10/2026'], [120, 'COMPRA AUTOMERCADO'], [400, '-25,000.00'], [480, '575,000.00']),
      L([40, 'Saldo final'], [480, '575,000.00']),
    ])
    expect(st.bank).toBe('generic')
    expect(st.groups[0].rows.map((r) => [r.date, r.description, r.amount, r.kind])).toEqual([
      ['2026-10-01', 'Deposito Salario Empresa', 500000, 'income'],
      ['2026-10-03', 'Compra Automercado', 25000, 'expense'],
    ])
  })
})
