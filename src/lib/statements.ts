import { addMonths } from '../domain/dates'
import type { Currency, DateKey, MonthKey } from '../domain/types'
import type { Line } from './pdfText'

/**
 * Lectura de estados de cuenta en PDF (ya convertidos en líneas por pdfText).
 * - BAC Credomatic (tarjetas de crédito): secciones B (compras), D y E (cargos), G (notas de crédito), C (intereses).
 * - Genérico (Wink y otros): cualquier línea con fecha y monto; el usuario decide si es gasto o ingreso.
 */

export type RowKind = 'expense' | 'income'
export type RowSection = 'compra' | 'cargo' | 'credito' | 'interes' | 'movimiento'

export interface StatementRow {
  /** Identificador estable para no importar dos veces la misma línea. */
  ref: string
  date: DateKey
  description: string
  place?: string
  /** Tarjetahabiente adicional (p. ej. tarjeta de la pareja). */
  holder?: string
  /** Negativo = crédito / reembolso. */
  amount: number
  currency: Currency
  kind: RowKind
  section: RowSection
}

export interface StatementGroup {
  /** "VISA", "AMERICAN EXPRESS"… */
  brand: string
  /** Últimos 4 dígitos de la cuenta y de los plásticos que aparecen. */
  last4s: string[]
  closingDate?: DateKey
  paymentDate?: DateKey
  /** Mes de pago del estado: los cargos se cobran aquí, sin importar la fecha de compra. */
  paymentMonth?: MonthKey
  /** Totales que declara el banco (para comprobar la lectura). */
  declaredTotals?: Partial<Record<Currency, number>>
  /** "Pago de contado" que pide el banco. */
  payoff?: Partial<Record<Currency, number>>
  rows: StatementRow[]
}

export interface Statement {
  bank: 'bac' | 'generic'
  groups: StatementGroup[]
}

const MONTHS: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, SEP: 9, OCT: 10, NOV: 11, DIC: 12,
  JAN: 1, APR: 4, AUG: 8, DEC: 12,
}

const pad = (n: number) => String(n).padStart(2, '0')

/** "6-SET-26", "06/09/2026", "06-09-26", "6 sep 2026" → "2026-09-06". */
export function parseStatementDate(s: string): DateKey | null {
  const t = s.trim().toUpperCase()
  let m = t.match(/^(\d{1,2})[-/ ]([A-Z]{3})[A-Z]*\.?[-/ ](\d{2}|\d{4})$/)
  if (m && MONTHS[m[2]]) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return `${y}-${pad(MONTHS[m[2]])}-${pad(Number(m[1]))}`
  }
  m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})$/)
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    const mo = Number(m[2])
    const d = Number(m[1])
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`
  }
  return null
}

/** "1,000.00" → 1000; "5,158.25-" → -5158.25; "(30.51)" → -30.51; "₡1.000,50" → 1000.5. */
export function parseStatementAmount(s: string): number | null {
  let t = s.replace(/[₡$¢\s]|CRC|USD/g, '')
  let negative = false
  if (/^\(.*\)$/.test(t)) {
    negative = true
    t = t.slice(1, -1)
  }
  if (t.endsWith('-')) {
    negative = true
    t = t.slice(0, -1)
  }
  if (t.startsWith('-')) {
    negative = true
    t = t.slice(1)
  }
  let n: number
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(t)) n = Number(t.replace(/,/g, ''))
  else if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(t)) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (/^\d+(\.\d{1,2})?$/.test(t)) n = Number(t)
  else return null
  return negative ? -n : n
}

const isAmount = (s: string) => parseStatementAmount(s) !== null && /\d[.,]\d{2}-?\)?$/.test(s.trim())
const text = (l: Line) => l.map((c) => c.str).join(' ')

/* ---------------- BAC ---------------- */

// Columnas de la tabla de movimientos (puntos PDF): todo lo que está a la derecha de esta x es "Monto en dólares".
const BAC_USD_COLUMN_X = 510
const BAC_PLACE_X = [300, 390] as const

export function isBacStatement(lines: Line[]): boolean {
  const all = lines.slice(0, 80).map(text).join('\n')
  return /BAC/i.test(all) && /Marca de tarjeta:/i.test(all) && /Detalle de compras|Movimientos de la tarjeta/i.test(lines.map(text).join('\n'))
}

export function parseBac(lines: Line[]): Statement {
  const groups: StatementGroup[] = []
  let group: StatementGroup | null = null
  let section: RowSection | 'pagos' | null = null
  let titular: string | undefined
  let holder: string | undefined
  const seen = new Map<string, number>()

  const amountsOf = (l: Line) => {
    const out: Partial<Record<Currency, number>> = {}
    for (const c of l) {
      if (!isAmount(c.str)) continue
      out[c.x >= BAC_USD_COLUMN_X ? 'USD' : 'CRC'] = parseStatementAmount(c.str)!
    }
    return out
  }

  for (const l of lines) {
    const t = text(l)
    const brand = l[0]?.str.match(/^Marca de tarjeta:\s*(.+)$/i)?.[1]
    if (brand) {
      group = { brand: brand.trim().toUpperCase(), last4s: [], rows: [] }
      groups.push(group)
      section = null
      titular = undefined
      holder = undefined
      continue
    }
    if (!group) continue

    if (/^Número de cuenta:/i.test(l[0]?.str ?? '')) {
      const last4 = t.match(/(\d{4})\s*$/)?.[1] ?? t.match(/\*+(\d{4})/)?.[1]
      if (last4 && !group.last4s.includes(last4)) group.last4s.push(last4)
      continue
    }
    const corte = l[0]?.str.match(/^Fecha de corte:\s*(\S+)/i)
    if (corte) {
      group.closingDate = parseStatementDate(corte[1]) ?? undefined
      continue
    }
    const limite = l[0]?.str.match(/^Fecha límite pago de contado:\s*(\S+)/i)
    if (limite) {
      group.paymentDate = parseStatementDate(limite[1]) ?? undefined
      group.paymentMonth = group.paymentDate?.slice(0, 7)
      continue
    }
    // La celda puede venir pegada a la columna anterior: "0.00 Total pago de contado".
    if (l.some((c) => /Total pago de contado$/i.test(c.str))) {
      const idx = l.findIndex((c) => /Total pago de contado$/i.test(c.str))
      const after = l.slice(idx + 1).filter((c) => isAmount(c.str))
      if (after.length) group.payoff = { CRC: parseStatementAmount(after[0].str)!, USD: after[1] ? parseStatementAmount(after[1].str)! : 0 }
      continue
    }

    // Encabezados de sección.
    const sec = l[0]?.str.match(/^([A-G])\)\s/)
    if (sec) {
      section = ({ A: 'pagos', B: 'compra', C: 'interes', D: 'cargo', E: 'cargo', F: 'cargo', G: 'credito' } as const)[sec[1] as 'A']
      continue
    }

    if (/^Total de compras del periodo/i.test(l[0]?.str ?? '')) {
      group.declaredTotals = amountsOf(l)
      continue
    }
    if (/^Total por concepto de intereses/i.test(l[0]?.str ?? '')) {
      const a = amountsOf(l)
      const date = group.closingDate ?? group.paymentDate
      for (const cur of ['CRC', 'USD'] as Currency[]) {
        if (a[cur] && date) {
          group.rows.push({
            ref: `bac|${group.brand}|interes|${date}|${cur}|${a[cur]}`,
            date,
            description: `Intereses ${titleCase(group.brand)}`,
            amount: a[cur]!,
            currency: cur,
            kind: 'expense',
            section: 'interes',
          })
        }
      }
      continue
    }

    // Subtítulo de plástico: "************8078 | JAZMIN" → las compras siguientes son de ese tarjetahabiente.
    const plastic = l[0]?.str.match(/^\*{4,}(\d{4})$/)
    if (plastic) {
      if (!group.last4s.includes(plastic[1])) group.last4s.push(plastic[1])
      const name = l.find((c) => c.x >= BAC_PLACE_X[0])?.str
      if (name) {
        if (!titular) titular = name
        holder = name === titular ? undefined : titleCase(name)
      }
      continue
    }
    if (section === 'pagos' || section === 'interes' || section === null) continue

    // Fila de movimiento: referencia, fecha, concepto, [lugar], moneda, monto.
    const date = l[1] && /^\d{6,}$/.test(l[0].str) ? parseStatementDate(l[1].str) : null
    if (!date) continue
    const descCells = l.filter((c, i) => i >= 2 && c.x < BAC_PLACE_X[0] && !isAmount(c.str))
    const place = l.find((c) => c.x >= BAC_PLACE_X[0] && c.x < BAC_PLACE_X[1] && !isAmount(c.str))?.str
    const amounts = amountsOf(l)
    for (const cur of ['CRC', 'USD'] as Currency[]) {
      const raw = amounts[cur]
      if (raw === undefined || raw === 0) continue
      const amount = section === 'credito' ? -Math.abs(raw) : raw
      const description = descCells.map((c) => c.str).join(' ')
      const base = `bac|${l[0].str}|${date}|${description}|${cur}|${amount}`
      const n = (seen.get(base) ?? 0) + 1
      seen.set(base, n)
      group.rows.push({
        ref: `${base}|${n}`,
        date,
        description: titleCase(description),
        place: place ? titleCase(place) : undefined,
        holder,
        amount,
        currency: cur,
        kind: 'expense',
        section: amount < 0 ? 'credito' : section,
      })
    }
  }
  return { bank: 'bac', groups: groups.filter((g) => g.rows.length || g.declaredTotals) }
}

/* ---------------- Genérico ---------------- */

const INCOME_HINTS = /dep[oó]sito|salario|planilla|transferencia recibida|sinpe recibido|cr[eé]dito|abono|intereses ganados|reintegro/i

/** Cualquier línea con fecha al inicio y un monto: sirve para Wink y otros estados de cuenta bancaria. */
export function parseGeneric(lines: Line[]): Statement {
  const rows: StatementRow[] = []
  const seen = new Map<string, number>()
  for (const l of lines) {
    const dateIdx = l.findIndex((c, i) => i <= 2 && parseStatementDate(c.str))
    if (dateIdx < 0) continue
    const date = parseStatementDate(l[dateIdx].str)!
    const amountCells = l.filter((c, i) => i > dateIdx && isAmount(c.str))
    if (!amountCells.length) continue
    // Con columnas de monto y saldo, el saldo es la última: se toma la primera cifra del movimiento.
    const raw = parseStatementAmount(amountCells[0].str)!
    const description = l
      .filter((c, i) => i > dateIdx && !isAmount(c.str) && !parseStatementDate(c.str) && !/^\d{6,}$/.test(c.str))
      .map((c) => c.str)
      .join(' ')
      .trim()
    if (!description) continue
    const currency: Currency = /\$|USD|d[oó]lar/i.test(text(l)) ? 'USD' : 'CRC'
    const kind: RowKind = raw < 0 ? 'expense' : INCOME_HINTS.test(description) ? 'income' : 'expense'
    const base = `gen|${date}|${description}|${raw}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    rows.push({ ref: `${base}|${n}`, date, description: titleCase(description), amount: Math.abs(raw), currency, kind, section: 'movimiento' })
  }
  return { bank: 'generic', groups: rows.length ? [{ brand: 'Movimientos', last4s: [], rows }] : [] }
}

export function parseStatement(lines: Line[]): Statement {
  if (isBacStatement(lines)) {
    const bac = parseBac(lines)
    if (bac.groups.some((g) => g.rows.length)) return bac
  }
  return parseGeneric(lines)
}

/** Suma de las compras leídas por moneda (para comparar con el total del banco). */
export function readTotals(g: StatementGroup): Record<Currency, number> {
  const t = { CRC: 0, USD: 0 }
  for (const r of g.rows) if (r.section !== 'interes') t[r.currency] += r.amount
  return { CRC: Math.round(t.CRC * 100) / 100, USD: Math.round(t.USD * 100) / 100 }
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/(^|[\s/(-])([a-záéíóúñ])/g, (_, sep: string, ch: string) => sep + ch.toUpperCase())
    .replace(/\b(Sl|Sa|Cr|Am|Pm|Tp)\b/g, (w) => w.toUpperCase())
}

/** Si el estado no trae mes de pago, se usa el mes siguiente al corte. */
export function groupPaymentMonth(g: StatementGroup): MonthKey | undefined {
  return g.paymentMonth ?? (g.closingDate ? addMonths(g.closingDate.slice(0, 7), 1) : undefined)
}
