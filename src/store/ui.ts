import { create } from 'zustand'

export type SheetKind = 'quick' | 'expense' | 'fixed' | 'installment' | 'income' | 'payment' | 'card' | 'settings'

export interface SheetState {
  kind: SheetKind
  /** id del registro a editar; ausente = nuevo. */
  id?: string
  /** Valores iniciales para un registro nuevo (p. ej. tarjeta preseleccionada). */
  preset?: Record<string, unknown>
}

interface Overlay {
  sheet: SheetState | null
  /** true mientras el sheet anima su salida. */
  closing: boolean
  toast: string | null
  open: (s: SheetState) => void
  close: () => void
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined
let closeTimer: ReturnType<typeof setTimeout> | undefined

export const useOverlay = create<Overlay>()((set, get) => ({
  sheet: null,
  closing: false,
  toast: null,
  open: (sheet) => {
    clearTimeout(closeTimer)
    set({ sheet, closing: false })
  },
  close: () => {
    if (!get().sheet || get().closing) return
    set({ closing: true })
    closeTimer = setTimeout(() => set({ sheet: null, closing: false }), 280)
  },
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2200)
  },
}))
