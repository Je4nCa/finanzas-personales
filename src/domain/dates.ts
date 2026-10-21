import type { DateKey, MonthKey } from './types'

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const pad = (n: number) => String(n).padStart(2, '0')

export function toMonthKey(year: number, month: number): MonthKey {
  // month es 1–12 y puede venir desbordado (0, 13…): se normaliza.
  const d = new Date(year, month - 1, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

export function parseMonth(m: MonthKey): { year: number; month: number } {
  const [y, mo] = m.split('-').map(Number)
  return { year: y, month: mo }
}

export function parseDate(d: DateKey): { year: number; month: number; day: number } {
  const [y, mo, day] = d.split('-').map(Number)
  return { year: y, month: mo, day }
}

export function addMonths(m: MonthKey, n: number): MonthKey {
  const { year, month } = parseMonth(m)
  return toMonthKey(year, month + n)
}

/** Diferencia en meses: b − a. */
export function monthDiff(a: MonthKey, b: MonthKey): number {
  const pa = parseMonth(a)
  const pb = parseMonth(b)
  return (pb.year - pa.year) * 12 + (pb.month - pa.month)
}

export function monthOf(d: DateKey): MonthKey {
  return d.slice(0, 7)
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Un día 31 en un mes de 30 días se interpreta como el último día del mes. */
export function clampDay(year: number, month: number, day: number): number {
  return Math.min(day, daysInMonth(year, month))
}

export function todayKey(): DateKey {
  const d = new Date()
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function currentMonth(): MonthKey {
  return monthOf(todayKey())
}

export function monthLabel(m: MonthKey): string {
  const { year, month } = parseMonth(m)
  return `${MONTHS[month - 1]} ${year}`
}

export function monthShort(m: MonthKey): string {
  return MONTHS_SHORT[parseMonth(m).month - 1]
}

export function dateLabel(d: DateKey): string {
  const { month, day } = parseDate(d)
  return `${day} ${MONTHS_SHORT[month - 1]}`
}

export function dayInMonthLabel(m: MonthKey, day: number): string {
  const { year, month } = parseMonth(m)
  return `${clampDay(year, month, day)} ${MONTHS_SHORT[month - 1]}`
}
