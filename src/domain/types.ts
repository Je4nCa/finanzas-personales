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

/** Moneda en que cobra la tarjeta; "both" = bimoneda (saldos en ₡ y $ por separado). */
export type CardCurrency = Currency | 'both'

export interface Card {
  id: string
  /** Nombre como lo llama el banco (p. ej. el del estado de cuenta). */
  name: string
  /** Apodo para mostrar en la app; ausente = se muestra el nombre. */
  nickname?: string | null
  /** Ausente = crédito. */
  kind?: CardKind
  /** Ausente = bimoneda. */
  currency?: CardCurrency
  /** Débito / cuenta: saldo disponible fijado por el usuario en balanceAt (por moneda). */
  balances?: Partial<Record<Currency, number>> | null
  /** Momento (ISO) en que se fijó el saldo; lo posterior suma o resta. */
  balanceAt?: string | null
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
  /** Momento (ISO) en que se registró; ordena contra un ajuste de saldo del mismo día. */
  createdAt?: string | null
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

/** Tipo de pago mensual. */
export type RecurringType = 'prestamo' | 'tasa_cero' | 'suscripcion' | 'otro'

/**
 * Pago mensual: préstamo/crédito, tasa cero, suscripción u otro.
 * Tasa cero reparte `total` en `months` cuotas; los demás usan `monthly` (la cuota fija).
 */
export interface Installment {
  id: string
  /** Ausente = tasa cero (los registros anteriores lo eran). */
  type?: RecurringType
  description: string
  /** Monto total (tasa cero). En los demás tipos se calcula o queda en 0 si no tiene fin. */
  total: number
  /** Cuota mensual fija (préstamos, suscripciones). */
  monthly?: number | null
  currency: Currency
  /** Tarjeta (crédito o débito) o cuenta con que se paga; null = pago directo. */
  cardId: string | null
  /** Cantidad de cuotas; null = sin fin (suscripciones). */
  months: number | null
  /** Día del mes en que vence (pagos que no son con tarjeta de crédito). */
  dueDay?: number | null
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

export type IncomeStatus = 'expected' | 'received'

export interface Income {
  id: string
  description: string
  amount: number
  currency: Currency
  date: DateKey
  /** 1 = primera quincena, 2 = segunda quincena. */
  fortnight: 1 | 2
  /** Cuenta o tarjeta de débito donde entró el dinero. */
  accountId?: string | null
  /** "expected" = programado: no cuenta hasta confirmarlo. Ausente = recibido. */
  status?: IncomeStatus
  /** Momento (ISO) en que se registró. */
  createdAt?: string | null
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
