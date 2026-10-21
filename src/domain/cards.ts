import type { ByCurrency } from './finance'
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
