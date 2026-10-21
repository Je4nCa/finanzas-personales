import type { ByCurrency } from './finance'
import type { AppData } from './types'
import type { Card, CardCurrency, CardKind, Currency } from './types'

export const cardKind = (c: Pick<Card, 'kind'>): CardKind => c.kind ?? 'credit'
export const isCredit = (c: Pick<Card, 'kind'>) => cardKind(c) === 'credit'

/** Lo que se muestra en la app: el apodo si hay, si no el nombre del banco. */
export const cardLabel = (c: Pick<Card, 'name' | 'nickname'>) => c.nickname?.trim() || c.name

export const KIND_LABEL: Record<CardKind, string> = { credit: 'Crédito', debit: 'Débito', account: 'Cuenta' }

export const cardCurrency = (c: Pick<Card, 'currency'>): CardCurrency => c.currency ?? 'both'

/** Moneda obligatoria de la tarjeta, o null si es bimoneda. */
export const fixedCurrency = (c: Pick<Card, 'currency'> | undefined | null): Currency | null => {
  const cur = c ? cardCurrency(c) : 'both'
  return cur === 'both' ? null : cur
}

export const CURRENCY_LABEL: Record<CardCurrency, string> = { CRC: 'Colones', USD: 'Dólares', both: 'Ambas' }

/**
 * Montos para mostrar sin convertir: cada moneda con saldo, la de la tarjeta primero.
 * Sin saldos devuelve un 0 en la moneda de la tarjeta (o colones si es bimoneda).
 */
export function amountsFor(t: ByCurrency, preferred: CardCurrency = 'both'): { amount: number; currency: Currency }[] {
  const order: Currency[] = preferred === 'USD' ? ['USD', 'CRC'] : ['CRC', 'USD']
  const out = order.filter((c) => Math.abs(t[c]) >= 0.005).map((c) => ({ amount: t[c], currency: c }))
  return out.length ? out : [{ amount: 0, currency: preferred === 'both' ? 'CRC' : preferred }]
}

const localDay = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * ¿El movimiento va después del ajuste de saldo? Días posteriores sí, anteriores no.
 * El mismo día decide la hora de registro; sin hora se asume incluido en el saldo fijado.
 */
function afterAnchor(date: string, createdAt: string | null | undefined, anchor: string | null | undefined): boolean {
  if (!anchor) return true
  const day = localDay(anchor)
  if (date !== day) return date > day
  return !!createdAt && createdAt > anchor
}

/** Disponible de una tarjeta de débito o cuenta: saldo fijado + ingresos − gastos posteriores. */
export function accountBalance(data: Pick<AppData, 'expenses' | 'incomes'>, card: Card): ByCurrency {
  const t: ByCurrency = { CRC: card.balances?.CRC ?? 0, USD: card.balances?.USD ?? 0 }
  for (const i of data.incomes) {
    if (i.accountId === card.id && afterAnchor(i.date, i.createdAt, card.balanceAt)) t[i.currency] += i.amount
  }
  for (const e of data.expenses) {
    if (e.cardId === card.id && afterAnchor(e.date, e.createdAt, card.balanceAt)) t[e.currency] -= e.amount
  }
  return { CRC: Math.round(t.CRC * 100) / 100, USD: Math.round(t.USD * 100) / 100 }
}

/** Cuenta sugerida para un ingreso: la del último ingreso con cuenta, si no la primera de débito/cuenta. */
export function defaultAccount(cards: Card[], incomes: { accountId?: string | null; date: string }[]): string | null {
  const ids = new Set(cards.filter((c) => !isCredit(c)).map((c) => c.id))
  const last = [...incomes].filter((i) => i.accountId && ids.has(i.accountId)).sort((a, b) => b.date.localeCompare(a.date))[0]
  return last?.accountId ?? cards.find((c) => !isCredit(c))?.id ?? null
}
