import { create } from 'zustand'

/** Sincronización activa solo si el build trae las credenciales públicas de Supabase. */
export const syncConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

export type SyncState = 'off' | 'syncing' | 'synced' | 'offline' | 'error'

interface SyncStatus {
  email: string | null
  state: SyncState
  lastSyncedAt: number | null
  error: string | null
}

/** Estado visible de la cuenta y la sincronización (sin importar el cliente de Supabase). */
export const useSyncStatus = create<SyncStatus>()(() => ({ email: null, state: 'off', lastSyncedAt: null, error: null }))

/** Carga el motor solo cuando se usa: la app sin Supabase no descarga el cliente. */
export const loadEngine = () => import('./engine')
