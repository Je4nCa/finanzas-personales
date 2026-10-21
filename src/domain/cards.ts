import type { Card, CardKind } from './types'

export const cardKind = (c: Pick<Card, 'kind'>): CardKind => c.kind ?? 'credit'
export const isCredit = (c: Pick<Card, 'kind'>) => cardKind(c) === 'credit'

/** Lo que se muestra en la app: el apodo si hay, si no el nombre del banco. */
export const cardLabel = (c: Pick<Card, 'name' | 'nickname'>) => c.nickname?.trim() || c.name

export const KIND_LABEL: Record<CardKind, string> = { credit: 'Crédito', debit: 'Débito', account: 'Cuenta' }
