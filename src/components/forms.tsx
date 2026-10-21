import { Trash2 } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { addMonths, currentMonth, dateLabel, monthDiff, monthLabel, parseDate, todayKey } from '../domain/dates'
import { cardLabel, CURRENCY_LABEL, defaultAccount, fixedCurrency, isCredit, KIND_LABEL } from '../domain/cards'
import { formatMoney, paymentMonthFor, RECURRING_LABEL } from '../domain/finance'
import type { Card, CardBank, CardCurrency, CardKind, CardNetwork, CardPayment, Currency, ExpenseScope, Expense, FixedExpense, Income, IncomeStatus, Installment, RecurringType } from '../domain/types'
import { newId, useData, useUi } from '../store/store'
import { useOverlay, type SheetState } from '../store/ui'
import { AccountPicker, cardSwatch, CardPicker, Field, MoneyInput, ScopePicker, Segmented, Sheet } from './ui'
import { BalanceSheet } from './BalanceSheet'
import { ConfirmIncomes } from './ConfirmIncomes'
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
  return <div className="chip purple" style={{ alignSelf: 'flex-start', fontSize: 12.5, padding: '6px 10px', whiteSpace: 'normal', lineHeight: 1.4 }}>{children}</div>
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
  // Tarjeta de una sola moneda: el gasto queda sí o sí en esa moneda.
  const lockCur = fixedCurrency(card)
  const cur = lockCur ?? currency
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
          currency: cur,
          date,
          cardId,
          category,
          scope,
          paymentMonth: fixedMonth,
          createdAt: existing ? existing.createdAt : new Date().toISOString(),
        } satisfies Expense)
      }
    >
      <MoneyInput amount={amount} currency={cur} locked={!!lockCur} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
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
            : card && isCredit(card)
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
  const lockCur = fixedCurrency(cards.find((c) => c.id === cardId))
  const cur = lockCur ?? currency
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
          currency: cur,
          cardId,
          startMonth,
          endMonth: endMonth || null,
          scope,
        } satisfies FixedExpense)
      }
    >
      <MoneyInput amount={amount} currency={cur} locked={!!lockCur} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
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

/* ---------------- Pagos mensuales ---------------- */

const TERM_OPTIONS = [3, 6, 10, 12, 18, 24, 36]

const TYPE_COPY: Record<RecurringType, { amount: string; name: string; months: string }> = {
  prestamo: { amount: 'Cuota mensual', name: 'Ej. Crédito del carro, préstamo personal', months: 'Cuotas que faltan' },
  tasa_cero: { amount: 'Monto total del producto', name: 'Ej. iPhone, refrigeradora…', months: 'Plazo (meses)' },
  suscripcion: { amount: 'Monto mensual', name: 'Ej. Netflix, Spotify, gimnasio', months: '' },
  otro: { amount: 'Monto mensual', name: 'Ej. Seguro, cuota del colegio', months: 'Cuántos meses (vacío = sin fin)' },
}

function InstallmentForm({ id, preset }: SheetState) {
  const { installments, cards, upsert, remove, settings } = useData()
  const month = useUi((s) => s.month)
  const existing = installments.find((i) => i.id === id)
  const [type, setType] = useState<RecurringType>(existing?.type ?? (preset?.type as RecurringType) ?? 'prestamo')
  const isTasaCero = type === 'tasa_cero'
  const [description, setDescription] = useState(existing?.description ?? '')
  const [amount, setAmount] = useState(existing ? String(existing.monthly ?? existing.total) : '')
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? settings.baseCurrency)
  const [cardId, setCardId] = useState<string | null>(existing ? existing.cardId : ((preset?.cardId as string) ?? null))
  const [months, setMonths] = useState(existing ? (existing.months == null ? '' : String(existing.months)) : '12')
  const [dueDay, setDueDay] = useState(existing?.dueDay ? String(existing.dueDay) : '')
  const [endMonth, setEndMonth] = useState(existing?.type === 'suscripcion' && existing.months != null ? addMonths(existing.firstMonth, existing.months - 1) : '')
  const [scope, setScope] = useState<ExpenseScope>(existing?.scope ?? 'personal')
  const card = cards.find((c) => c.id === cardId)
  const [firstMonth, setFirstMonth] = useState(existing?.firstMonth ?? (card && isCredit(card) ? paymentMonthFor(card, todayKey()) : month))
  const lockCur = fixedCurrency(card)
  const cur = lockCur ?? currency
  const n = parseAmount(amount)
  // Suscripción: sin fin, o hasta el mes indicado. Otro: meses opcionales. Préstamo y tasa cero: obligatorios.
  const m = type === 'suscripcion' ? (endMonth ? monthDiff(firstMonth, endMonth) + 1 : null) : months.trim() === '' && type === 'otro' ? null : parseInt(months, 10)
  const validMonths = m === null || (Number.isInteger(m) && m >= 1 && m <= 360)
  const dd = dueDay ? parseInt(dueDay, 10) : null
  const validDay = dd === null || (dd >= 1 && dd <= 31)
  const copy = TYPE_COPY[type]
  const payWithCredit = !!card && isCredit(card)

  return (
    <FormShell
      title={existing ? `Editar ${RECURRING_LABEL[type].toLowerCase()}` : 'Nuevo pago mensual'}
      valid={!!n && !!description.trim() && validMonths && validDay && !!firstMonth}
      onDelete={existing && (() => remove('installments', existing.id))}
      onSubmit={() =>
        upsert('installments', {
          ...existing,
          id: existing?.id ?? newId(),
          type,
          description: description.trim(),
          // Tasa cero guarda el total y reparte; el resto guarda la cuota (y el total si tiene fin).
          total: isTasaCero ? n! : m ? Math.round(n! * m * 100) / 100 : 0,
          monthly: isTasaCero ? null : n!,
          currency: cur,
          cardId,
          months: m,
          firstMonth,
          dueDay: payWithCredit ? null : dd,
          paidMonths: existing?.paidMonths ?? [],
          scope,
        } satisfies Installment)
      }
    >
      <Segmented
        value={type}
        onChange={setType}
        options={(['prestamo', 'tasa_cero', 'suscripcion', 'otro'] as RecurringType[]).map((t) => ({ value: t, label: t === 'prestamo' ? 'Crédito' : t === 'otro' ? 'Otro' : RECURRING_LABEL[t] }))}
      />
      <Field label={copy.amount}>
        <MoneyInput amount={amount} currency={cur} locked={!!lockCur} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
      </Field>
      <Field label="Nombre">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={copy.name} />
      </Field>
      {type !== 'suscripcion' && (
        <Field label={copy.months}>
          <div className="choice-row">
            {isTasaCero &&
              TERM_OPTIONS.map((t) => (
                <button key={t} type="button" className={`choice ${m === t ? 'on' : ''}`} onClick={() => setMonths(String(t))}>
                  {t}
                </button>
              ))}
            <input
              className="input"
              style={{ width: isTasaCero ? 80 : 140, height: 40, flex: 'none' }}
              inputMode="numeric"
              value={months}
              placeholder={type === 'otro' ? 'Sin fin' : 'Ej. 36'}
              onChange={(e) => setMonths(e.target.value.replace(/\D/g, ''))}
            />
          </div>
        </Field>
      )}
      {n && isTasaCero && m && <Hint>Cuota mensual: {formatMoney(n / m, cur)}</Hint>}
      {n && !isTasaCero && m && <Hint>Te falta pagar {formatMoney(n * m, cur)} en {m} cuotas</Hint>}
      <Field label="¿Con qué lo pagás?">
        <CardPicker
          cards={cards}
          value={cardId}
          nullLabel="Directo / transferencia"
          onChange={(cid) => {
            setCardId(cid)
            const c = cards.find((x) => x.id === cid)
            if (!existing && c && isCredit(c)) setFirstMonth(paymentMonthFor(c, todayKey()))
          }}
        />
      </Field>
      {card && !isCredit(card) && <Hint>Al marcar cada cuota como pagada se descuenta del disponible de {cardLabel(card)}.</Hint>}
      <div className="grid-2">
        <Field label={payWithCredit ? 'Primer mes de pago' : 'Desde (mes)'}>
          <input className="input" type="month" value={firstMonth} onChange={(e) => setFirstMonth(e.target.value)} />
        </Field>
        {type === 'suscripcion' ? (
          <Field label="Hasta (opcional)">
            <input className="input" type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
          </Field>
        ) : (
          !payWithCredit && (
            <Field label="Día de pago (opcional)">
              <input className="input num" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))} placeholder="15" />
            </Field>
          )
        )}
      </div>
      {type === 'suscripcion' && !payWithCredit && (
        <Field label="Día de cobro (opcional)">
          <input className="input num" inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, ''))} placeholder="1" />
        </Field>
      )}
      {m && firstMonth && type !== 'suscripcion' && <Hint>Última cuota: {monthLabel(addMonths(firstMonth, m - 1))}</Hint>}
      <Field label="Tipo de gasto">
        <ScopePicker value={scope} onChange={setScope} />
      </Field>
    </FormShell>
  )
}

/* ---------------- Ingreso ---------------- */

function IncomeForm({ id, preset }: SheetState) {
  const { incomes, cards, upsert, remove, settings } = useData()
  const month = useUi((s) => s.month)
  const existing = incomes.find((i) => i.id === id)
  const p = (preset ?? {}) as Partial<{ description: string; amount: string; currency: Currency; date: string; fortnight: 1 | 2; accountId: string | null; status: IncomeStatus }>
  const defaultDate = p.date ?? (month === currentMonth() ? todayKey() : `${month}-15`)
  const [description, setDescription] = useState(existing?.description ?? p.description ?? 'Salario')
  const [amount, setAmount] = useState(existing ? String(existing.amount) : (p.amount ?? ''))
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? p.currency ?? settings.baseCurrency)
  const [date, setDate] = useState(existing?.date ?? defaultDate)
  const [fortnight, setFortnight] = useState<1 | 2>(existing?.fortnight ?? p.fortnight ?? (parseDate(defaultDate).day <= 15 ? 1 : 2))
  // Fecha futura = programado (no cuenta hasta confirmarlo); se puede cambiar.
  const [status, setStatus] = useState<IncomeStatus>(existing?.status ?? p.status ?? (defaultDate > todayKey() ? 'expected' : 'received'))
  const [accountId, setAccountId] = useState<string | null>(existing ? (existing.accountId ?? null) : p.accountId !== undefined ? p.accountId : defaultAccount(cards, incomes))
  // Una cuenta de una sola moneda recibe sí o sí en esa moneda.
  const lockCur = fixedCurrency(cards.find((c) => c.id === accountId))
  const cur = lockCur ?? currency
  const n = parseAmount(amount)

  return (
    <FormShell
      title={existing ? (status === 'expected' ? 'Ingreso programado' : 'Editar ingreso') : 'Nuevo ingreso'}
      valid={!!n && !!description.trim() && !!date}
      onDelete={existing && (() => remove('incomes', existing.id))}
      onSubmit={() =>
        upsert('incomes', {
          ...existing,
          id: existing?.id ?? newId(),
          description: description.trim(),
          amount: n!,
          currency: cur,
          date,
          fortnight,
          accountId,
          status,
          // Al confirmarlo se registra la hora, para que cuente contra un ajuste de saldo del mismo día.
          createdAt: existing && existing.status === status ? existing.createdAt : new Date().toISOString(),
        } satisfies Income)
      }
    >
      <MoneyInput amount={amount} currency={cur} locked={!!lockCur} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing} />
      <Field label="Descripción">
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Segmented
        value={status}
        onChange={setStatus}
        options={[
          { value: 'received', label: 'Ya lo recibí' },
          { value: 'expected', label: 'Programado' },
        ]}
      />
      {status === 'expected' && <Hint>No cuenta en tus ingresos ni en el disponible hasta que confirmes que llegó. Ese día la app te pregunta.</Hint>}
      <Field label={status === 'expected' ? '¿A qué cuenta va a entrar?' : '¿A qué cuenta entró?'}>
        <AccountPicker cards={cards} value={accountId} onChange={setAccountId} />
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
            if (!existing && e.target.value) setStatus(e.target.value > todayKey() ? 'expected' : 'received')
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
  const [cardId, setCardId] = useState<string | null>(existing?.cardId ?? (preset?.cardId as string) ?? cards.find(isCredit)?.id ?? null)
  const [amount, setAmount] = useState(existing ? String(existing.amount) : preset?.amount ? String(preset.amount) : '')
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? (preset?.currency as Currency) ?? settings.baseCurrency)
  const [date, setDate] = useState(existing?.date ?? todayKey())
  const month = existing?.month ?? uiMonth
  const lockCur = fixedCurrency(cards.find((c) => c.id === cardId))
  const cur = lockCur ?? currency
  const n = parseAmount(amount)

  return (
    <FormShell
      title={existing ? 'Editar abono' : 'Registrar abono'}
      valid={!!n && !!cardId && !!date}
      onDelete={existing && (() => remove('payments', existing.id))}
      onSubmit={() => upsert('payments', { id: existing?.id ?? newId(), cardId: cardId!, month, amount: n!, currency: cur, date } satisfies CardPayment)}
    >
      <Hint>Aplica al pago de {monthLabel(month)}</Hint>
      <MoneyInput amount={amount} currency={cur} locked={!!lockCur} onAmount={setAmount} onCurrency={setCurrency} autoFocus={!existing && !preset?.amount} />
      <Field label="Tarjeta">
        <div className="choice-row">
          {cards.filter(isCredit).map((c) => (
            <button key={c.id} type="button" className={`choice ${cardId === c.id ? 'on' : ''}`} onClick={() => setCardId(c.id)}>
              <span className="swatch" style={{ background: cardSwatch(c.theme) }} />
              {cardLabel(c)}
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
  const [nickname, setNickname] = useState(existing?.nickname ?? '')
  const [kind, setKind] = useState<CardKind>(existing?.kind ?? 'credit')
  const [currency, setCurrency] = useState<CardCurrency>(existing?.currency ?? 'both')
  const credit = kind === 'credit'
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
  const valid = !!name.trim() && (!credit || (validDay(cd) && validDay(pd)))
  const today = todayKey()

  return (
    <FormShell
      title={existing ? `Editar ${credit ? 'tarjeta' : KIND_LABEL[kind].toLowerCase()}` : 'Nueva tarjeta o cuenta'}
      valid={valid}
      onDelete={existing && (() => remove('cards', existing.id))}
      onSubmit={() =>
        upsert('cards', {
          id: existing?.id ?? newId(),
          name: name.trim(),
          nickname: nickname.trim() || null,
          kind,
          currency,
          lastFour,
          // Débito y cuentas no tienen ciclo; se guardan valores neutros.
          closingDay: credit ? cd : 1,
          paymentDay: credit ? pd : 1,
          theme,
          network: shownNetwork,
          bank: shownBank,
        } satisfies Card)
      }
    >
      <Field label="Tipo">
        <Segmented
          value={kind}
          onChange={setKind}
          options={(['credit', 'debit', 'account'] as CardKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))}
        />
      </Field>
      <Field label="Moneda en que cobra">
        <Segmented
          value={currency}
          onChange={setCurrency}
          options={(['CRC', 'USD', 'both'] as CardCurrency[]).map((c) => ({ value: c, label: CURRENCY_LABEL[c] }))}
        />
      </Field>
      {currency !== 'both' && <Hint>Los gastos, abonos, fijos y cuotas de esta tarjeta quedan siempre en {CURRENCY_LABEL[currency].toLowerCase()}.</Hint>}
      <Field label={credit ? 'Nombre (como en el estado de cuenta)' : 'Nombre (como lo llama el banco)'}>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={credit ? 'Ej. BAC Visa, BCR Mastercard' : 'Ej. Wink débito, Cuenta de ahorros BAC'}
          autoFocus={!existing}
        />
      </Field>
      <Field label="Apodo (opcional, es el que se muestra)">
        <input className="input" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Ej. La morada, Visa del súper" />
      </Field>
      <Field label="Últimos 4 dígitos">
        <input className="input num" inputMode="numeric" maxLength={4} value={lastFour} onChange={(e) => setLastFour(e.target.value.replace(/\D/g, ''))} placeholder="1327" />
      </Field>
      {credit && (
      <div className="grid-2">
        <Field label="Día de cierre">
          <input className="input num" inputMode="numeric" value={closingDay} onChange={(e) => setClosingDay(e.target.value.replace(/\D/g, ''))} placeholder="20" />
        </Field>
        <Field label="Día de pago">
          <input className="input num" inputMode="numeric" value={paymentDay} onChange={(e) => setPaymentDay(e.target.value.replace(/\D/g, ''))} placeholder="5" />
        </Field>
      </div>
      )}
      {!credit && <Hint>Los gastos con {kind === 'debit' ? 'esta tarjeta de débito' : 'esta cuenta'} cuentan en el mes de la compra.</Hint>}
      {credit && validDay(cd) && validDay(pd) && (
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
    case 'balance':
      return <BalanceSheet key={key} {...sheet} />
    case 'confirmIncomes':
      return <ConfirmIncomes key={key} />
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
