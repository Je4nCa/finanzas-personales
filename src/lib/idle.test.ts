import { describe, expect, it } from 'vitest'
import { idleTooLong, RELOCK_AFTER_MS } from './idle'

describe('bloqueo por inactividad', () => {
  const now = Date.parse('2026-10-21T12:00:00Z')
  it('recargar o volver antes de 1 hora no pide Face ID', () => {
    expect(idleTooLong(now - 5_000, now)).toBe(false)
    expect(idleTooLong(now - 59 * 60_000, now)).toBe(false)
  })
  it('después de 1 hora sin usarla sí', () => {
    expect(idleTooLong(now - RELOCK_AFTER_MS - 1, now)).toBe(true)
  })
  it('sin registro de uso (primera vez en el dispositivo) sí', () => {
    expect(idleTooLong(null, now)).toBe(true)
  })
})
