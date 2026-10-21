import { create } from 'zustand'

export type SheetKind = 'expense' | 'fixed' | 'installment' | 'income' | 'payment' | 'card' | 'settings'

export interface SheetState {
  kind: SheetKind
  /** id del registro a editar; ausente = nuevo. */
  id?: string
  /** Valores iniciales para un registro nuevo (p. ej. tarjeta preseleccionada). */
  preset?: Record<string, unknown>
}

interface Overlay {
  sheet: SheetState | null
  toast: string | null
  open: (s: SheetState) => void
  close: () => void
  showToast: (msg: string) => void
}

let toastTimer: ReturnType<typeof setTimeout> | undefined

export const useOverlay = create<Overlay>()((set) => ({
  sheet: null,
  toast: null,
  open: (sheet) => set({ sheet }),
  close: () => set({ sheet: null }),
  showToast: (toast) => {
    clearTimeout(toastTimer)
    set({ toast })
    toastTimer = setTimeout(() => set({ toast: null }), 2200)
  },
}))
