export type Currency = 'USD' | 'CRC'

/** Mes en formato "YYYY-MM". */
export type MonthKey = string

/** Fecha en formato "YYYY-MM-DD". */
export type DateKey = string

export type Money = { amount: number; currency: Currency }

export type CardNetwork = 'visa' | 'mastercard' | 'amex' | null
export type CardBank = 'bac' | 'wink' | null

/** Crédito: tiene cierre y fecha de pago. Débito y cuenta: el gasto cuenta en el mes de la compra. */
export type CardKind = 'credit' | 'debit' | 'account'

export interface Card {
  id: string
  /** Nombre como lo llama el banco (p. ej. el del estado de cuenta). */
  name: string
  /** Apodo para mostrar en la app; ausente = se muestra el nombre. */
  nickname?: string | null
  /** Ausente = crédito. */
  kind?: CardKind
  lastFour: string
  /** Día del mes en que cierra el estado de cuenta (1–31). Solo crédito. */
  closingDay: number
  /** Día del mes en que vence el pago (1–31). Solo crédito. */
  paymentDay: number
  /** Índice del degradado visual de la tarjeta. */
  theme: number
  /** Ausente = se deduce del nombre. */
  network?: CardNetwork
  bank?: CardBank
}

/** De quién es el gasto: solo mío, de la casa o compartido con la pareja. */
export type ExpenseScope = 'personal' | 'casa' | 'pareja'

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
  /** Ausente = personal. */
  scope?: ExpenseScope
  /** Mes de pago fijado por un estado de cuenta importado; manda sobre el calculado por la fecha. */
  paymentMonth?: MonthKey | null
  /** Línea del estado de cuenta de donde salió (evita importarla dos veces). */
  sourceRef?: string | null
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
  scope?: ExpenseScope
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
  scope?: ExpenseScope
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
  /** Línea del estado de cuenta de donde salió (evita importarla dos veces). */
  sourceRef?: string | null
}

export type ThemePref = 'system' | 'light' | 'dark'

export interface Settings {
  userName: string
  theme: ThemePref
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
