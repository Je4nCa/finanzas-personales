import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Wallet, X } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { addMonths, currentMonth, monthLabel } from '../domain/dates'
import { formatMoney } from '../domain/finance'
import type { Card, Currency } from '../domain/types'
import { useUi } from '../store/store'

export function Money({ amount, currency, compact }: { amount: number; currency: Currency; compact?: boolean }) {
  return <span className="num">{formatMoney(amount, currency, { compact })}</span>
}

export function Delta({ value, invert }: { value: number; invert?: boolean }) {
  if (!Number.isFinite(value)) return null
  const up = value >= 0
  const good = invert ? !up : up
  return (
    <span className={`delta ${good ? 'up' : 'down'}`}>
      <span className="dot">{up ? <ArrowUp /> : <ArrowDown />}</span>
      <span className="num">{Math.abs(value * 100).toFixed(1)}%</span>
    </span>
  )
}

export function IconTile({ children }: { children: ReactNode }) {
  return <span className="icon-tile">{children}</span>
}

export function Progress({ value, tone = 'purple', thin }: { value: number; tone?: 'purple' | 'green' | 'red' | 'amber'; thin?: boolean }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={`progress ${tone} ${thin ? 'thin' : ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}

export function MonthNav({ hint }: { hint?: string }) {
  const { month, setMonth } = useUi()
  const isCurrent = month === currentMonth()
  return (
    <div className="month-nav glass">
      <button className="icon-btn round glass" onClick={() => setMonth(addMonths(month, -1))} aria-label="Mes anterior">
        <ChevronLeft />
      </button>
      <button className="label" onClick={() => setMonth(currentMonth())}>
        {monthLabel(month)}
        <small>{hint ?? (isCurrent ? 'Mes actual' : 'Tocá para volver a hoy')}</small>
      </button>
      <button className="icon-btn round glass" onClick={() => setMonth(addMonths(month, 1))} aria-label="Mes siguiente">
        <ChevronRight />
      </button>
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  small,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  small?: boolean
}) {
  return (
    <div className={`segmented ${small ? 'small' : ''}`}>
      {options.map((o) => (
        <button key={o.value} type="button" className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function CreditCard({ card, label, amount, currency }: { card: Card; label: string; amount: number; currency: Currency }) {
  return (
    <div className={`cc cc-theme-${card.theme % 6}`}>
      <div className="cc-top">
        <span className="cc-name">{card.name}</span>
        <svg width="34" height="22" viewBox="0 0 34 22" aria-hidden>
          <circle cx="12" cy="11" r="10" fill="currentColor" opacity=".85" />
          <circle cx="22" cy="11" r="10" fill="currentColor" opacity=".45" />
        </svg>
      </div>
      <div className="cc-bottom">
        <div className="row">
          <div className="spacer">
            <div className="cc-label">{label}</div>
            <div className="cc-amount">
              <Money amount={amount} currency={currency} />
            </div>
            <div className="cc-num">•••• {card.lastFour || '0000'}</div>
          </div>
          <span className="chip-metal" />
        </div>
      </div>
    </div>
  )
}

export function Empty({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <Wallet />
      <div>{text}</div>
      {action}
    </div>
  )
}

export function Sheet({ title, onClose, children, actions }: { title: string; onClose: () => void; children: ReactNode; actions?: ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        <div className="sheet-head">
          <h2>{title}</h2>
          {actions}
          <button className="icon-btn round glass" onClick={onClose} aria-label="Cerrar">
            <X />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function MoneyInput({
  amount,
  currency,
  onAmount,
  onCurrency,
  autoFocus,
}: {
  amount: string
  currency: Currency
  onAmount: (v: string) => void
  onCurrency: (c: Currency) => void
  autoFocus?: boolean
}) {
  return (
    <div className="money-input">
      <input
        className="input num"
        inputMode="decimal"
        placeholder="0"
        value={amount}
        autoFocus={autoFocus}
        onChange={(e) => onAmount(e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
      />
      <Segmented
        value={currency}
        onChange={onCurrency}
        options={[
          { value: 'CRC', label: '₡' },
          { value: 'USD', label: '$' },
        ]}
      />
    </div>
  )
}

const SWATCHES = ['#8f86ef', '#ffb39a', '#555a6e', '#6fd3b8', '#de8ff0', '#6fbcfd']
export const cardSwatch = (theme: number) => SWATCHES[theme % SWATCHES.length]

export function CardPicker({ cards, value, onChange }: { cards: Card[]; value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="choice-row">
      {cards.map((c) => (
        <button key={c.id} type="button" className={`choice ${value === c.id ? 'on' : ''}`} onClick={() => onChange(c.id)}>
          <span className="swatch" style={{ background: cardSwatch(c.theme) }} />
          {c.name}
        </button>
      ))}
      <button type="button" className={`choice ${value === null ? 'on' : ''}`} onClick={() => onChange(null)}>
        Efectivo / débito
      </button>
    </div>
  )
}

/** Medidor semicircular: value 0–1. */
export function Gauge({ value, label, display, color = 'var(--purple)' }: { value: number; label: string; display: string; color?: string }) {
  const r = 90
  const len = Math.PI * r
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className="gauge">
      <svg viewBox="0 0 220 120">
        <path d="M20 110 A90 90 0 0 1 200 110" fill="none" stroke="#ebebf0" strokeWidth="18" strokeLinecap="round" />
        <path
          d="M20 110 A90 90 0 0 1 200 110"
          fill="none"
          stroke={color}
          strokeWidth="18"
          strokeLinecap="round"
          strokeDasharray={`${len * v} ${len}`}
          style={{ transition: 'stroke-dasharray .6s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="gauge-center">
        <div className="lbl">{label}</div>
        <div className="val num">{display}</div>
      </div>
    </div>
  )
}
