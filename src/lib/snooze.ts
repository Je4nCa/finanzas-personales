import { todayKey } from '../domain/dates'

const KEY = 'finanzas-income-snooze'

/** Ingresos programados que el usuario pospuso hoy ("todavía no"): se vuelven a preguntar mañana. */
function read(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

export function snoozeIncome(id: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), [id]: todayKey() }))
  } catch {
    // Sin almacenamiento se vuelve a preguntar en la próxima apertura.
  }
}

export function isSnoozed(id: string): boolean {
  return read()[id] === todayKey()
}
