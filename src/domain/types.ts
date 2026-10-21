export type Currency = 'USD' | 'CRC'

/** Mes en formato "YYYY-MM". */
export type MonthKey = string

/** Fecha en formato "YYYY-MM-DD". */
export type DateKey = string

export type Money = { amount: number; currency: Currency }

export interface Card {
  id: string
  name: string
  lastFour: string
  /** Día del mes en que cierra el estado de cuenta (1–31). */
  closingDay: number
  /** Día del mes en que vence el pago (1–31). */
  paymentDay: number
  /** Índice del degradado visual de la tarjeta. */
  theme: number
}

/** Gasto variable: compras del día a día. */
export interface Expense {
  id: string
  description: string
  amount: number
  currency: Currency
  date: DateKey
  /** null = efectivo / débito: se cuenta en el mes de la compra. */
  cardId: string | null
  category: string
}

/** Gasto fijo mensual (suscripciones, servicios). */
export interface FixedExpense {
  id: string
  description: string
  amount: number
  currency: Currency
  cardId: string | null
  /** Primer mes de pago en que aplica. */
  startMonth: MonthKey
  /** Último mes de pago en que aplica (inclusive); null = sin fin. */
  endMonth: MonthKey | null
}

/** Financiamiento a tasa cero: cuotas iguales mes a mes. */
export interface Installment {
  id: string
  description: string
  total: number
  currency: Currency
  cardId: string | null
  months: number
  /** Mes de pago de la primera cuota. */
  firstMonth: MonthKey
  /** Meses de pago cuya cuota ya se marcó como pagada. */
  paidMonths: MonthKey[]
}

/** Abono parcial (o total) hecho a una tarjeta para un mes de pago. */
export interface CardPayment {
  id: string
  cardId: string
  month: MonthKey
  amount: number
  currency: Currency
  date: DateKey
}

export interface Income {
  id: string
  description: string
  amount: number
  currency: Currency
  date: DateKey
  /** 1 = primera quincena, 2 = segunda quincena. */
  fortnight: 1 | 2
}

export interface Settings {
  userName: string
  /** Moneda en que se muestran los totales. */
  baseCurrency: Currency
  /** Colones por 1 dólar. */
  exchangeRate: number
  /** Presupuesto mensual de gastos en moneda base; 0 = usar los ingresos del mes. */
  monthlyBudget: number
}

export interface AppData {
  cards: Card[]
  expenses: Expense[]
  fixed: FixedExpense[]
  installments: Installment[]
  payments: CardPayment[]
  incomes: Income[]
  settings: Settings
}
