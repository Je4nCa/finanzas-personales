import type { AppData, Settings } from '../domain/types'

/** Colecciones de la app que se guardan como filas, con su tabla en Supabase. */
export const TABLES = {
  cards: 'cards',
  expenses: 'expenses',
  fixed: 'fixed_expenses',
  installments: 'installments',
  payments: 'card_payments',
  incomes: 'incomes',
} as const

export type Collection = keyof typeof TABLES
export const COLLECTIONS = Object.keys(TABLES) as Collection[]

type Row = Record<string, unknown>

const toSnake = (k: string) => k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
const toCamel = (k: string) => k.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

/** Columnas del servidor que la app no guarda en sus objetos. */
const SERVER_COLUMNS = new Set(['user_id', 'updated_at', 'deleted_at'])

/** Objeto de la app → fila. undefined se envía como null (p. ej. red/banco "detectar por nombre"). */
export function toRow(item: object): Row {
  const row: Row = {}
  for (const [k, v] of Object.entries(item)) row[toSnake(k)] = v === undefined ? null : v
  return row
}

/** Fila → objeto de la app. numeric llega como string desde PostgREST; null opcional vuelve a undefined. */
export function fromRow<C extends Collection>(collection: C, row: Row): AppData[C][number] {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (SERVER_COLUMNS.has(k)) continue
    out[toCamel(k)] = v
  }
  for (const k of ['amount', 'total']) if (k in out) out[k] = Number(out[k])
  if (collection === 'incomes' && out.sourceRef === null) delete out.sourceRef
  if (collection === 'expenses') {
    if (out.paymentMonth === null) delete out.paymentMonth
    if (out.sourceRef === null) delete out.sourceRef
  }
  if (collection === 'cards') {
    if (out.nickname === null) delete out.nickname
    if (out.network === null) delete out.network
    if (out.bank === null) delete out.bank
  }
  return out as unknown as AppData[C][number]
}

/** Ajustes que se sincronizan (el tema es de cada dispositivo). */
export function settingsToRow(s: Settings, userId: string): Row {
  return {
    id: userId,
    user_name: s.userName,
    base_currency: s.baseCurrency,
    exchange_rate: s.exchangeRate,
    monthly_budget: s.monthlyBudget,
  }
}

export function settingsFromRow(row: Row): Partial<Settings> {
  return {
    userName: String(row.user_name ?? ''),
    baseCurrency: row.base_currency === 'USD' ? 'USD' : 'CRC',
    exchangeRate: Number(row.exchange_rate),
    monthlyBudget: Number(row.monthly_budget),
  }
}

export type Change = { collection: Collection; id: string; op: 'upsert' | 'delete' }

/**
 * Qué registros cambiaron entre dos estados del store. El store es inmutable:
 * un objeto distinto con el mismo id es una edición.
 */
export function diff(prev: AppData, next: AppData): Change[] {
  const changes: Change[] = []
  for (const collection of COLLECTIONS) {
    const a = prev[collection] as { id: string }[]
    const b = next[collection] as { id: string }[]
    if (a === b) continue
    const before = new Map(a.map((x) => [x.id, x]))
    const after = new Set<string>()
    for (const item of b) {
      after.add(item.id)
      if (before.get(item.id) !== item) changes.push({ collection, id: item.id, op: 'upsert' })
    }
    for (const id of before.keys()) if (!after.has(id)) changes.push({ collection, id, op: 'delete' })
  }
  return changes
}

export function settingsChanged(a: Settings, b: Settings): boolean {
  return a.userName !== b.userName || a.baseCurrency !== b.baseCurrency || a.exchangeRate !== b.exchangeRate || a.monthlyBudget !== b.monthlyBudget
}
