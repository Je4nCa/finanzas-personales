import { isCredit } from './cards'
import { addMonths, clampDay, monthDiff, monthOf, parseDate } from './dates'
import type { AppData, Card, Currency, DateKey, ExpenseScope, Installment, MonthKey, Settings } from './types'

/**
 * Mes en que se paga una compra hecha con una tarjeta.
 * La compra entra al estado que cierra en el próximo día de cierre (inclusive),
 * y ese estado se paga en el siguiente día de pago posterior al cierre.
 */
export function paymentMonthFor(card: Pick<Card, 'closingDay' | 'paymentDay' | 'kind'>, date: DateKey): MonthKey {
  // Débito y cuentas no tienen ciclo: el gasto sale en el mes de la compra.
  if (!isCredit(card)) return monthOf(date)
  const { year, month, day } = parseDate(date)
  const closingThisMonth = clampDay(year, month, card.closingDay)
  const closingMonth = day <= closingThisMonth ? monthOf(date) : addMonths(monthOf(date), 1)
  return card.paymentDay > card.closingDay ? closingMonth : addMonths(closingMonth, 1)
}

export function convert(amount: number, from: Currency, to: Currency, rate: number): number {
  if (from === to) return amount
  return from === 'USD' ? amount * rate : amount / rate
}

/** Monto de la cuota n (0-based); la última absorbe el redondeo. */
export function installmentAmount(inst: Installment, index: number): number {
  const base = Math.floor((inst.total / inst.months) * 100) / 100
  if (index < inst.months - 1) return base
  return Math.round((inst.total - base * (inst.months - 1)) * 100) / 100
}

/** Índice de la cuota que cae en el mes, o -1 si no aplica. */
export function installmentIndex(inst: Installment, month: MonthKey): number {
  const i = monthDiff(inst.firstMonth, month)
  return i >= 0 && i < inst.months ? i : -1
}

export type ChargeKind = 'variable' | 'fijo' | 'cuota'

export interface Charge {
  kind: ChargeKind
  sourceId: string
  description: string
  amount: number
  currency: Currency
  cardId: string | null
  /** Fecha de compra (solo gastos variables). */
  date?: DateKey
  /** "3/12" para cuotas. */
  detail?: string
  category?: string
  scope: ExpenseScope
}

/** Todo lo que se cobra en un mes de pago, sin importar cuándo se compró. */
export function chargesForMonth(data: AppData, month: MonthKey): Charge[] {
  const cardById = new Map(data.cards.map((c) => [c.id, c]))
  const out: Charge[] = []

  for (const e of data.expenses) {
    const card = e.cardId ? cardById.get(e.cardId) : undefined
    const pm = e.paymentMonth ?? (card ? paymentMonthFor(card, e.date) : monthOf(e.date))
    if (pm !== month) continue
    out.push({
      kind: 'variable',
      sourceId: e.id,
      description: e.description,
      amount: e.amount,
      currency: e.currency,
      cardId: card ? e.cardId : null,
      date: e.date,
      category: e.category,
      scope: e.scope ?? 'personal',
    })
  }

  for (const f of data.fixed) {
    if (f.startMonth > month || (f.endMonth && f.endMonth < month)) continue
    out.push({
      kind: 'fijo',
      sourceId: f.id,
      description: f.description,
      amount: f.amount,
      currency: f.currency,
      cardId: f.cardId && cardById.has(f.cardId) ? f.cardId : null,
      scope: f.scope ?? 'personal',
    })
  }

  for (const inst of data.installments) {
    const i = installmentIndex(inst, month)
    if (i < 0) continue
    out.push({
      kind: 'cuota',
      sourceId: inst.id,
      description: inst.description,
      amount: installmentAmount(inst, i),
      currency: inst.currency,
      cardId: inst.cardId && cardById.has(inst.cardId) ? inst.cardId : null,
      detail: `${i + 1}/${inst.months}`,
      scope: inst.scope ?? 'personal',
    })
  }

  return out
}

export type ByCurrency = Record<Currency, number>

const zero = (): ByCurrency => ({ USD: 0, CRC: 0 })

export function sumByCurrency(items: { amount: number; currency: Currency }[]): ByCurrency {
  const t = zero()
  for (const it of items) t[it.currency] += it.amount
  return t
}

export function toBase(t: ByCurrency, s: Settings): number {
  return convert(t.USD, 'USD', s.baseCurrency, s.exchangeRate) + convert(t.CRC, 'CRC', s.baseCurrency, s.exchangeRate)
}

export interface CardMonthSummary {
  card: Card
  charges: Charge[]
  /** Total cobrado, por moneda. */
  billed: ByCurrency
  /** Abonos ya hechos, por moneda. */
  paid: ByCurrency
  /** Lo que falta pagar, por moneda (nunca negativo). */
  owed: ByCurrency
  owedBase: number
  billedBase: number
}

/**
 * Lo que se debe a cada tarjeta en un mes de pago.
 * Las tarjetas en Costa Rica suelen ser bimoneda: los saldos en USD y CRC se llevan por separado
 * y cada abono descuenta el saldo de su moneda.
 */
export function cardSummaries(data: AppData, month: MonthKey, charges = chargesForMonth(data, month)): CardMonthSummary[] {
  // Solo las tarjetas de crédito generan un pago a fin de mes.
  return data.cards.filter(isCredit).map((card) => {
    const cc = charges.filter((c) => c.cardId === card.id)
    const billed = sumByCurrency(cc)
    const paid = sumByCurrency(data.payments.filter((p) => p.cardId === card.id && p.month === month))
    const owed: ByCurrency = {
      USD: Math.max(0, round2(billed.USD - paid.USD)),
      CRC: Math.max(0, round2(billed.CRC - paid.CRC)),
    }
    return {
      card,
      charges: cc,
      billed,
      paid,
      owed,
      owedBase: toBase(owed, data.settings),
      billedBase: toBase(billed, data.settings),
    }
  })
}

export interface MonthBalance {
  income: number
  expenses: number
  free: number
  budget: number
  /** gastos / presupuesto (0–∞). */
  usage: number
  byKind: Record<ChargeKind, number>
  cash: number
}

export function monthBalance(data: AppData, month: MonthKey, charges = chargesForMonth(data, month)): MonthBalance {
  const s = data.settings
  const creditIds = new Set(data.cards.filter(isCredit).map((c) => c.id))
  const income = toBase(sumByCurrency(data.incomes.filter((i) => monthOf(i.date) === month)), s)
  const expenses = toBase(sumByCurrency(charges), s)
  const kindTotal = (k: ChargeKind) => toBase(sumByCurrency(charges.filter((c) => c.kind === k)), s)
  const budget = s.monthlyBudget > 0 ? s.monthlyBudget : income
  return {
    income,
    expenses,
    free: income - expenses,
    budget,
    usage: budget > 0 ? expenses / budget : expenses > 0 ? Infinity : 0,
    byKind: { variable: kindTotal('variable'), fijo: kindTotal('fijo'), cuota: kindTotal('cuota') },
    cash: toBase(sumByCurrency(charges.filter((c) => c.cardId === null || !creditIds.has(c.cardId))), s),
  }
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function formatMoney(amount: number, currency: Currency, opts: { compact?: boolean } = {}): string {
  const symbol = currency === 'USD' ? '$' : '₡'
  const decimals = currency === 'CRC' || opts.compact ? 0 : 2
  const abs = Math.abs(amount)
  const s = abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${amount < 0 ? '−' : ''}${symbol}${s}`
}
