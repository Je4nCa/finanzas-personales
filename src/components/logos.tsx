import { siAmericanexpress, siApple, siClaude, siNetflix, siPlaystation, siSpotify, siUber, siVisa } from 'simple-icons'
import { Bus, CircleEllipsis, HeartPulse, Home as HomeIcon, PawPrint, Popcorn, ShoppingBag, ShoppingCart, Utensils } from 'lucide-react'
import bacLogo from '../assets/logos/bac.png'
import winkLogo from '../assets/logos/wink.png'
import { norm } from '../domain/parseExpense'
import type { Card, CardBank, CardNetwork } from '../domain/types'

type Icon = { path: string; hex: string; title: string }

function SimpleIcon({ icon, size = 18, color }: { icon: Icon; size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} role="img" aria-label={icon.title} fill={color ?? `#${icon.hex}`}>
      <path d={icon.path} />
    </svg>
  )
}

/* ---------------- Comercios ---------------- */

// Logos negros (Apple, Uber) usan currentColor para verse en tema oscuro.
const MERCHANTS: { keys: string[]; icon: Icon; mono?: boolean }[] = [
  { keys: ['spotify'], icon: siSpotify },
  { keys: ['claude', 'anthropic'], icon: siClaude },
  { keys: ['apple', 'icloud', 'app store', 'appstore', 'iphone', 'ipad', 'macbook', 'airpods', 'apple music', 'apple tv'], icon: siApple, mono: true },
  { keys: ['playstation', 'psn', 'ps plus', 'ps5', 'ps4', 'play station'], icon: siPlaystation },
  { keys: ['netflix'], icon: siNetflix },
  { keys: ['uber'], icon: siUber, mono: true },
]

function merchantFor(description: string) {
  const d = ` ${norm(description)} `
  return MERCHANTS.find((m) => m.keys.some((k) => d.includes(` ${k} `) || d.includes(` ${k}`)))
}

const CATEGORY_ICON: Record<string, typeof Utensils> = {
  Comida: Utensils,
  Súper: ShoppingCart,
  Transporte: Bus,
  Compras: ShoppingBag,
  Salud: HeartPulse,
  Hogar: HomeIcon,
  Ocio: Popcorn,
  Mascotas: PawPrint,
}

/** Logo del comercio si lo reconoce; si no, el ícono de la categoría. */
export function ExpenseIcon({ description, category }: { description: string; category?: string }) {
  const m = merchantFor(description)
  if (m) {
    return (
      <span className="icon-tile brand">
        <SimpleIcon icon={m.icon} color={m.mono ? 'currentColor' : undefined} />
      </span>
    )
  }
  const C = (category && CATEGORY_ICON[category]) || CircleEllipsis
  return (
    <span className="icon-tile">
      <C />
    </span>
  )
}

/* ---------------- Tarjetas ---------------- */

export function detectNetwork(name: string): CardNetwork {
  const n = norm(name)
  if (n.includes('visa')) return 'visa'
  if (n.includes('master')) return 'mastercard'
  if (n.includes('amex') || n.includes('american')) return 'amex'
  return null
}

export function detectBank(name: string): CardBank {
  const n = norm(name)
  if (/\bbac\b|credomatic/.test(n)) return 'bac'
  if (n.includes('wink') || n.includes('coopenae')) return 'wink'
  return null
}

export const networkOf = (c: Card): CardNetwork => (c.network !== undefined ? c.network : detectNetwork(c.name))
export const bankOf = (c: Card): CardBank => (c.bank !== undefined ? c.bank : detectBank(c.name))

/** Marca de la red, monocroma como en las tarjetas metálicas (Visa) o a color (Mastercard). */
export function NetworkLogo({ network, size = 22 }: { network: CardNetwork; size?: number }) {
  if (network === 'visa') return <SimpleIcon icon={siVisa} size={size * 1.9} color="currentColor" />
  if (network === 'amex') return <SimpleIcon icon={siAmericanexpress} size={size * 1.25} />
  if (network === 'mastercard') {
    return (
      <svg viewBox="0 0 38 24" width={size * 1.6} height={size} role="img" aria-label="Mastercard">
        <circle cx="12" cy="12" r="11" fill="#EB001B" />
        <circle cx="26" cy="12" r="11" fill="#F79E1B" />
        <path d="M19 3.5a11 11 0 0 1 0 17 11 11 0 0 1 0-17z" fill="#FF5F00" />
      </svg>
    )
  }
  return null
}

const BANK_LOGOS: Record<Exclude<CardBank, null>, { src: string; name: string }> = {
  bac: { src: bacLogo, name: 'BAC' },
  wink: { src: winkLogo, name: 'Wink' },
}

/** Logo oficial del banco (archivos provistos por el usuario). */
export function BankBadge({ bank }: { bank: CardBank }) {
  if (!bank) return null
  const logo = BANK_LOGOS[bank]
  return <img className="bank-logo" src={logo.src} alt={logo.name} width={24} height={24} />
}
