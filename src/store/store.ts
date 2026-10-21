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
  settings: { userName: '', theme: 'system', baseCurrency: 'CRC', exchangeRate: 510, monthlyBudget: 0 },
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
      replaceAll: (data) => setState({ ...emptyData(), ...data, settings: { ...emptyData().settings, ...data.settings } }),
    }),
    {
      name: 'finanzas-data',
      version: 1,
      storage: createJSONStorage(() => idbStorage),
      // Los ajustes guardados antes de agregar un campo nuevo no lo traen: se completan con los valores por defecto.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AppData>
        return { ...current, ...p, settings: { ...current.settings, ...p.settings } }
      },
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

// En la vista previa (artifact) arranca con datos de ejemplo si no hay nada guardado.
if (import.meta.env.VITE_DEMO) {
  useData.persist.onFinishHydration((s) => {
    import('../demo').then(({ demoData, DEMO_VERSION }) => {
      let seen: string | null = null
      try {
        seen = localStorage.getItem('demo-version')
        localStorage.setItem('demo-version', String(DEMO_VERSION))
      } catch {
        // Sin almacenamiento: se muestran los ejemplos igual.
      }
      // Datos vacíos o de una versión anterior de los ejemplos → se cargan los nuevos.
      if ((s.cards.length === 0 && s.expenses.length === 0) || seen !== String(DEMO_VERSION)) s.replaceAll(demoData())
    })
  })
}

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
