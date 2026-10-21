import { Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { addMonths, currentMonth, dateLabel, monthLabel, parseDate, todayKey } from '../domain/dates'
import { formatMoney, paymentMonthFor } from '../domain/finance'
import type { Card, CardBank, CardNetwork, CardPayment, Currency, ExpenseScope, Expense, FixedExpense, Income, Installment } from '../domain/types'
import { newId, useData, useUi } from '../store/store'
import { useOverlay, type SheetState } from '../store/ui'
import { cardSwatch, CardPicker, Field, MoneyInput, ScopePicker, Segmented, Sheet } from './ui'
import { ImportSheet } from './ImportSheet'
import { QuickAdd } from './QuickAdd'
import { SettingsSheet } from './SettingsSheet'
import { BankBadge, detectBank, detectNetwork, NetworkLogo } from './logos'

export const CATEGORIES = ['Comida', 'Súper', 'Transporte', 'Compras', 'Salud', 'Hogar', 'Mascotas', 'Ocio', 'Otros']

const parseAmount = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

function FormShell({
  title,
  onSubmit,
  onDelete,
  valid,
  children,
}: {
  title: string
  onSubmit: () => void
  onDelete?: () => void
  valid: boolean
  children: ReactNode
}) {
  const close = useOverlay((s) => s.close)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    onSubmit()
    close()
  }
  return (
    <Sheet
      title={title}
      onClose={close}
      actions={
        onDelete && (
          <button
            type="button"
            className="icon-btn round glass"
            style={{ color: 'var(--red)' }}
            aria-label="Eliminar"
            onClick={() => {
              if (confirm('¿Eliminar este registro?')) {
                onDelete()
                close()
              }
            }}
          >
            <Trash2 />
          </button>
        )
      }
    >
      <form className="form" onSubmit={submit}>
        {children}
        <div className="form-actions">
          <button type="submit" className="pill-btn dark block" disabled={!valid} style={{ opacity: valid ? 1 : 0.4 }}>
            Guardar
          </button>
        </div>
      </form>
    </Sheet>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="chip purple" style={{ alignSelf: 'flex-start', fontSize: 12.5, padding: '6px 10px' }}>{children}</div>
}

/* ---------------- Gasto variable ---------------- */

function ExpenseForm({ id, preset }: SheetState) {
  const { expenses, cards, upsert, remove, settings } = useData()
  const existing = expenses.find((e) => e.id === id)
  const p = (preset ?? {}) as Partial<Record<'description' | 'amount' | 'currency' | 'date' | 'category', string>> & { cardId?: string | null; scope?: ExpenseScope }
  const [description, setDescription] = useState(existing?.description ?? p.description ?? '')
  // Un reembolso (crédito del estado de cuenta) se edita en positivo y conserva su signo.
  const sign = existing && existing.amount < 0 ? -1 : 1
  const [amount, setAmount] = useState(existing ? String(Math.abs(existing.amount)) : (p.amount ?? ''))
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? (p.currency as Currency) ?? settings.baseCurrency)
  const [date, setDate] = useState(existing?.date ?? p.date ?? todayKey())
  const [cardId, setCardId] = useState<string | null>(existing ? existing.cardId : p.cardId !== undefined ? p.cardId : (cards[0]?.id ?? null))
  const [category, setCategory] = useState(existing?.category ?? p.category ?? 'Comida')
  const [scope, setScope] = useState<ExpenseScope>(existing?.scope ?? p.scope ?? 'personal')
  const card = cards.find((c) => c.id === cardId)
  const n = parseAmount(amount)
  // Un gasto importado conserva el mes de pago del estado de cuenta mientras no cambie de tarjeta.
  const fixedMonth = existing?.paymentMonth && existing.cardId === cardId ? existing.paymentMonth : null

  return (
    <FormShell
      title={sign < 0 ? 'Editar reembolso' : existing ? 'Editar gasto' : 'Nuevo gasto'}
      valid={!!n && !!description.trim() && !!date}
      onDelete={existing && (() => remove('expenses', existing.id))}
      onSubmit={() =>
        upsert('expenses', {
          ...existing,
          id: existing?.id ?? newId(),
          description: description.trim(),
          amount: n! * sign,
          currency,
          date,
          cardId,
          category,
          scope,
          paymentMonth: fixedMonth,
        } satisfies Expense)
      }
    >
      <MoneyInput amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
      <Field label="Descripción">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Súper, gasolina…" />
      </Field>
      <Field label="Tarjeta">
        <CardPicker cards={cards} value={cardId} onChange={setCardId} />
      </Field>
      {date && (
        <Hint>
          {fixedMonth
            ? `Según el estado de cuenta, se cobra en ${monthLabel(fixedMonth)}`
            : card
              ? `Se cobra en el pago de ${monthLabel(paymentMonthFor(card, date))}`
              : `Cuenta en ${monthLabel(date.slice(0, 7))}`}
        </Hint>
      )}
      <Field label="Fecha de compra">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <Field label="Categoría">
        <div className="choice-row" style={{ flexWrap: 'wrap' }}>
          {CATEGORIES.map((c) => (
            <button key={c} type="button" className={`choice ${category === c ? 'on' : ''}`} onClick={() => setCategory(c)}>
              {c}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Tipo de gasto">
        <ScopePicker value={scope} onChange={setScope} />
      </Field>
    </FormShell>
  )
}

/* ---------------- Gasto fijo ---------------- */

function FixedForm({ id, preset }: SheetState) {
  const { fixed, cards, upsert, remove, settings } = useData()
  const month = useUi((s) => s.month)
  const existing = fixed.find((f) => f.id === id)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '')
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? settings.baseCurrency)
  const [cardId, setCardId] = useState<string | null>(existing ? existing.cardId : ((preset?.cardId as string) ?? cards[0]?.id ?? null))
  const [startMonth, setStartMonth] = useState(existing?.startMonth ?? month)
  const [endMonth, setEndMonth] = useState(existing?.endMonth ?? '')
  const [scope, setScope] = useState<ExpenseScope>(existing?.scope ?? 'personal')
  const n = parseAmount(amount)

  return (
    <FormShell
      title={existing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
      valid={!!n && !!description.trim() && !!startMonth && (!endMonth || endMonth >= startMonth)}
      onDelete={existing && (() => remove('fixed', existing.id))}
      onSubmit={() =>
        upsert('fixed', {
          id: existing?.id ?? newId(),
          description: description.trim(),
          amount: n!,
          currency,
          cardId,
          startMonth,
          endMonth: endMonth || null,
          scope,
        } satisfies FixedExpense)
      }
    >
      <MoneyInput amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
      <Field label="Descripción">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. Netflix, internet…" />
      </Field>
      <Field label="Tarjeta">
        <CardPicker cards={cards} value={cardId} onChange={setCardId} />
      </Field>
      <div className="grid-2">
        <Field label="Desde (mes de pago)">
          <input className="input" type="month" value={startMonth} onChange={(e) => setStartMonth(e.target.value)} />
        </Field>
        <Field label="Hasta (opcional)">
          <input className="input" type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
        </Field>
      </div>
      <Field label="Tipo de gasto">
        <ScopePicker value={scope} onChange={setScope} />
      </Field>
    </FormShell>
  )
}

/* ---------------- Tasa cero ---------------- */

const TERM_OPTIONS = [3, 6, 10, 12, 18, 24, 36]

function InstallmentForm({ id, preset }: SheetState) {
  const { installments, cards, upsert, remove, settings } = useData()
  const existing = installments.find((i) => i.id === id)
  const [description, setDescription] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.total) : '')
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? settings.baseCurrency)
  const [cardId, setCardId] = useState<string | null>(existing ? existing.cardId : ((preset?.cardId as string) ?? cards[0]?.id ?? null))
  const [months, setMonths] = useState(String(existing?.months ?? 12))
  const [scope, setScope] = useState<ExpenseScope>(existing?.scope ?? 'personal')
  const card = cards.find((c) => c.id === cardId)
  const [firstMonth, setFirstMonth] = useState(existing?.firstMonth ?? (card ? paymentMonthFor(card, todayKey()) : currentMonth()))
  const n = parseAmount(amount)
  const m = parseInt(months, 10)
  const validMonths = Number.isInteger(m) && m >= 1 && m <= 120

  return (
    <FormShell
      title={existing ? 'Editar tasa cero' : 'Nueva tasa cero'}
      valid={!!n && !!description.trim() && validMonths && !!firstMonth}
      onDelete={existing && (() => remove('installments', existing.id))}
      onSubmit={() =>
        upsert('installments', {
          id: existing?.id ?? newId(),
          description: description.trim(),
          total: n!,
          currency,
          cardId,
          months: m,
          firstMonth,
          paidMonths: existing?.paidMonths ?? [],
          scope,
        } satisfies Installment)
      }
    >
      <Field label="Monto total del producto">
        <MoneyInput amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
      </Field>
      <Field label="Producto">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ej. iPhone, refrigeradora…" />
      </Field>
      <Field label="Plazo (meses)">
        <div className="choice-row">
          {TERM_OPTIONS.map((t) => (
            <button key={t} type="button" className={`choice ${m === t ? 'on' : ''}`} onClick={() => setMonths(String(t))}>
              {t}
            </button>
          ))}
          <input className="input" style={{ width: 80, height: 40, flex: 'none' }} inputMode="numeric" value={months} onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))} />
        </div>
      </Field>
      {n && validMonths && <Hint>Cuota mensual: {formatMoney(n / m, currency)}</Hint>}
      <Field label="Tarjeta">
        <CardPicker
          cards={cards}
          value={cardId}
          onChange={(cid) => {
            setCardId(cid)
            const c = cards.find((x) => x.id === cid)
            if (!existing && c) setFirstMonth(paymentMonthFor(c, todayKey()))
          }}
        />
      </Field>
      <Field label="Mes de pago de la primera cuota">
        <input className="input" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} />
      </Field>
      {validMonths && firstMonth && <Hint>Última cuota: {monthLabel(addMonths(firstMonth, m - 1))}</Hint>}
      <Field label="Tipo de gasto">
        <ScopePicker value={scope} onChange={setScope} />
      </Field>
    </FormShell>
  )
}

/* ---------------- Ingreso ---------------- */

function IncomeForm({ id, preset }: SheetState) {
  const { incomes, upsert, remove, settings } = useData()
  const month = useUi((s) => s.month)
  const existing = incomes.find((i) => i.id === id)
  const p = (preset ?? {}) as Partial<{ description: string; amount: string; currency: Currency; date: string; fortnight: 1 | 2 }>
  const defaultDate = p.date ?? (month === currentMonth() ? todayKey() : `${month}-15`)
  const [description, setDescription] = useState(existing?.description ?? p.description ?? 'Salario')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : (p.amount ?? ''))
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? p.currency ?? settings.baseCurrency)
  const [date, setDate] = useState(existing?.date ?? defaultDate)
  const [fortnight, setFortnight] = useState<1 | 2>(existing?.fortnight ?? p.fortnight ?? (parseDate(defaultDate).day <= 15 ? 1 : 2))
  const n = parseAmount(amount)

  return (
    <FormShell
      title={existing ? 'Editar ingreso' : 'Nuevo ingreso'}
      valid={!!n && !!description.trim() && !!date}
      onDelete={existing && (() => remove('incomes', existing.id))}
      onSubmit={() => upsert('incomes', { id: existing?.id ?? newId(), description: description.trim(), amount: n!, currency, date, fortnight } satisfies Income)}
    >
      <MoneyInput amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
      <Field label="Descripción">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Quincena">
        <Segmented
          value={String(fortnight) as '1' | '2'}
          onChange={(v) => setFortnight(v === '1' ? 1 : 2)}
          options={[
            { value: '1', label: 'Primera (1–15)' },
            { value: '2', label: 'Segunda (16–fin)' },
          ]}
        />
      </Field>
      <Field label="Fecha">
        <input
          className="input"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            if (e.target.value) setFortnight(parseDate(e.target.value).day <= 15 ? 1 : 2)
          }}
        />
      </Field>
    </FormShell>
  )
}

/* ---------------- Abono a tarjeta ---------------- */

function PaymentForm({ id, preset }: SheetState) {
  const { payments, cards, upsert, remove, settings } = useData()
  const uiMonth = useUi((s) => s.month)
  const existing = payments.find((p) => p.id === id)
  const [cardId, setCardId] = useState<string | null>(existing?.cardId ?? (preset?.cardId as string) ?? cards[0]?.id ?? null)
  const [amount, setAmount] = useState(existing ? String(existing.amount) : preset?.amount ? String(preset.amount) : '')
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? (preset?.currency as Currency) ?? settings.baseCurrency)
  const [date, setDate] = useState(existing?.date ?? todayKey())
  const month = existing?.month ?? uiMonth
  const n = parseAmount(amount)

  return (
    <FormShell
      title={existing ? 'Editar abono' : 'Registrar abono'}
      valid={!!n && !!cardId && !!date}
      onDelete={existing && (() => remove('payments', existing.id))}
      onSubmit={() => upsert('payments', { id: existing?.id ?? newId(), cardId: cardId!, month, amount: n!, currency, date } satisfies CardPayment)}
    >
      <Hint>Aplica al pago de {monthLabel(month)}</Hint>
      <MoneyInput amount={amount} currency={currency} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing && !preset?.amount} />
      <Field label="Tarjeta">
        <div className="choice-row">
          {cards.map((c) => (
            <button key={c.id} type="button" className={`choice ${cardId === c.id ? 'on' : ''}`} onClick={() => setCardId(c.id)}>
              <span className="swatch" style={{ background: cardSwatch(c.theme) }} />
              {c.name}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Fecha del abono">
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
    </FormShell>
  )
}

/* ---------------- Tarjeta ---------------- */

function CardForm({ id }: SheetState) {
  const { cards, upsert, remove } = useData()
  const existing = cards.find((c) => c.id === id)
  const [name, setName] = useState(existing?.name ?? '')
  const [lastFour, setLastFour] = useState(existing?.lastFour ?? '')
  const [closingDay, setClosingDay] = useState(String(existing?.closingDay ?? ''))
  const [paymentDay, setPaymentDay] = useState(String(existing?.paymentDay ?? ''))
  const [theme, setTheme] = useState(existing?.theme ?? cards.length % 6)
  // undefined = deducir del nombre mientras el usuario no elija.
  const [network, setNetwork] = useState<CardNetwork | undefined>(existing?.network)
  const [bank, setBank] = useState<CardBank | undefined>(existing?.bank)
  const shownNetwork = network !== undefined ? network : detectNetwork(name)
  const shownBank = bank !== undefined ? bank : detectBank(name)
  const cd = parseInt(closingDay, 10)
  const pd = parseInt(paymentDay, 10)
  const validDay = (d: number) => Number.isInteger(d) && d >= 1 && d <= 31
  const valid = !!name.trim() && validDay(cd) && validDay(pd)
  const today = todayKey()

  return (
    <FormShell
      title={existing ? 'Editar tarjeta' : 'Nueva tarjeta'}
      valid={valid}
      onDelete={existing && (() => remove('cards', existing.id))}
      onSubmit={() =>
        upsert('cards', { id: existing?.id ?? newId(), name: name.trim(), lastFour, closingDay: cd, paymentDay: pd, theme, network: shownNetwork, bank: shownBank } satisfies Card)
      }
    >
      <Field label="Nombre">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. BAC Visa, BCR Mastercard" autoFocus={!existing} />
      </Field>
      <Field label="Últimos 4 dígitos">
        <input className="input num" inputMode="numeric" maxLength={4} value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))} placeholder="1327" />
      </Field>
      <div className="grid-2">
        <Field label="Día de cierre">
          <input className="input num" inputMode="numeric" value={closingDay} onChange={(e) => setClosingDay(e.target.value.replace(/\D/g, ''))} placeholder="20" />
        </Field>
        <Field label="Día de pago">
          <input className="input num" inputMode="numeric" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value.replace(/\D/g, ''))} placeholder="5" />
        </Field>
      </div>
      {validDay(cd) && validDay(pd) && (
        <Hint>
          Una compra de hoy ({dateLabel(today)}) se paga en {monthLabel(paymentMonthFor({ closingDay: cd, paymentDay: pd }, today))}
        </Hint>
      )}
      <Field label="Red">
        <div className="choice-row">
          {(['visa', 'mastercard', 'amex', null] as CardNetwork[]).map((n) => (
            <button key={String(n)} type="button" className={`choice ${shownNetwork === n ? 'on' : ''}`} onClick={() => setNetwork(n)}>
              {n ? <NetworkLogo network={n} size={14} /> : 'Otra'}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Banco">
        <div className="choice-row">
          {(['bac', 'wink', null] as CardBank[]).map((b) => (
            <button key={String(b)} type="button" className={`choice ${shownBank === b ? 'on' : ''}`} onClick={() => setBank(b)}>
              {b ? (
                <>
                  <BankBadge bank={b} />
                  {b === 'bac' ? 'BAC' : 'Wink'}
                </>
              ) : (
                'Otro'
              )}
            </button>
          ))}
        </div>
      </Field>
      <Field label="Color">
        <div className="choice-row">
          {[0, 1, 2, 3, 4, 5].map((t) => (
            <button
              key={t}
              type="button"
              aria-label={`Color ${t + 1}`}
              className={`cc-theme-${t}`}
              onClick={() => setTheme(t)}
              style={{ width: 44, height: 30, borderRadius: 9, flex: 'none', outline: theme === t ? '2.5px solid var(--ink)' : 'none', outlineOffset: 2 }}
            />
          ))}
        </div>
      </Field>
    </FormShell>
  )
}

/* ---------------- Host ---------------- */

export function SheetHost() {
  const sheet = useOverlay((s) => s.sheet)
  if (!sheet) return null
  // key fuerza estado nuevo al abrir otro registro.
  const key = `${sheet.kind}-${sheet.id ?? 'new'}`
  switch (sheet.kind) {
    case 'quick':
      return <QuickAdd key={key} {...sheet} />
    case 'import':
      return <ImportSheet key={key} />
    case 'expense':
      return <ExpenseForm key={key} {...sheet} />
    case 'fixed':
      return <FixedForm key={key} {...sheet} />
    case 'installment':
      return <InstallmentForm key={key} {...sheet} />
    case 'income':
      return <IncomeForm key={key} {...sheet} />
    case 'payment':
      return <PaymentForm key={key} {...sheet} />
    case 'card':
      return <CardForm key={key} {...sheet} />
    case 'settings':
      return <SettingsSheet key={key} />
  }
}
