import { del, get, set } from 'idb-keyval'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { useShallow } from 'zustand/react/shallow'
import { currentMonth } from '../domain/dates'
import type { AppData, Card, CardPayment, Expense, FixedExpense, Income, Installment, MonthKey, Settings } from '../domain/types'

const idbStorage: StateStorage = {
  getItem: async (name) => (await get<string>(name)) ?? null,
  setItem: (name, value) => set(name, value),
  removeItem: (name) => del(name),
}

export const emptyData = (): AppData => ({
  cards: [],
  expenses: [],
  fixed: [],
  installments: [],
  payments: [],
  incomes: [],
  settings: { userName: '', baseCurrency: 'CRC', exchangeRate: 510, monthlyBudget: 0 },
})

type Collection = Exclude<keyof AppData, 'settings'>
type ItemOf<K extends Collection> = AppData[K][number]

interface Actions {
  upsert: <K extends Collection>(key: K, item: ItemOf<K>) => void
  remove: (key: Collection, id: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  toggleInstallmentPaid: (id: string, month: MonthKey) => void
  replaceAll: (data: AppData) => void
}

interface UiState {
  month: MonthKey
  setMonth: (m: MonthKey) => void
}

export const useData = create<AppData & Actions>()(
  persist(
    (setState) => ({
      ...emptyData(),
      upsert: (key, item) =>
        setState((s) => {
          const list = s[key] as { id: string }[]
          const exists = list.some((x) => x.id === item.id)
          return { [key]: exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item] }
        }),
      remove: (key, id) =>
        setState((s) => {
          const next: Partial<AppData> = { [key]: (s[key] as { id: string }[]).filter((x) => x.id !== id) }
          // Al borrar una tarjeta se borran sus abonos; sus gastos quedan como efectivo.
          if (key === 'cards') {
            next.payments = s.payments.filter((p) => p.cardId !== id)
            next.expenses = s.expenses.map((e) => (e.cardId === id ? { ...e, cardId: null } : e))
            next.fixed = s.fixed.map((f) => (f.cardId === id ? { ...f, cardId: null } : f))
            next.installments = s.installments.map((i) => (i.cardId === id ? { ...i, cardId: null } : i))
          }
          return next
        }),
      updateSettings: (patch) => setState((s) => ({ settings: { ...s.settings, ...patch } })),
      toggleInstallmentPaid: (id, month) =>
        setState((s) => ({
          installments: s.installments.map((i) =>
            i.id !== id
              ? i
              : { ...i, paidMonths: i.paidMonths.includes(month) ? i.paidMonths.filter((m) => m !== month) : [...i.paidMonths, month] },
          ),
        })),
      replaceAll: (data) => setState({ ...emptyData(), ...data }),
    }),
    {
      name: 'finanzas-data',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      partialize: (s): AppData => ({
        cards: s.cards,
        expenses: s.expenses,
        fixed: s.fixed,
        installments: s.installments,
        payments: s.payments,
        incomes: s.incomes,
        settings: s.settings,
      }),
    },
  ),
)

export const useUi = create<UiState>()((setState) => ({
  month: currentMonth(),
  setMonth: (month) => setState({ month }),
}))

/** Solo los datos, sin acciones (para cálculos y exportación). */
export function selectData(s: AppData & Actions): AppData {
  return {
    cards: s.cards,
    expenses: s.expenses,
    fixed: s.fixed,
    installments: s.installments,
    payments: s.payments,
    incomes: s.incomes,
    settings: s.settings,
  }
}

export const useAppData = () => useData(useShallow(selectData))

// crypto.randomUUID solo existe en contextos seguros (no al abrir por IP en la red local).
export const newId = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

// Pide al navegador que no borre los datos bajo presión de espacio.
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  navigator.storage.persist().catch(() => {})
}

export type { Card, CardPayment, Expense, FixedExpense, Income, Installment }
