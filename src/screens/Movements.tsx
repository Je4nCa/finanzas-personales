import { FileUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { dateLabel, monthOf, todayKey } from '../domain/dates'
import { isReceived, sumByCurrency, toBase } from '../domain/finance'
import { amountsFor, cardLabel } from '../domain/cards'
import type { Card, ExpenseScope } from '../domain/types'
import { ExpenseIcon } from '../components/logos'
import { Amounts, cardSwatch, Empty, Money, MonthNav, SCOPES, Segmented } from '../components/ui'
import { useOverlay } from '../store/ui'
import { useMonthView } from '../store/useMonth'

type View = 'gastos' | 'ingresos'

export function Movements() {
  const [view, setView] = useState<View>('gastos')
  return (
    <>
      <MonthNav hint={view === 'ingresos' ? 'Ingresos del mes' : 'Mes de pago'} />
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'gastos', label: 'Gastos' },
          { value: 'ingresos', label: 'Ingresos' },
        ]}
      />
      {view === 'gastos' && <Expenses />}
      {view === 'ingresos' && <Incomes />}
    </>
  )
}

function CardTag({ card }: { card?: Card }) {
  return (
    <span className="row" style={{ gap: 5 }}>
      <span style={{ width: 8, height: 8, borderRadius: 3, background: card ? cardSwatch(card.theme) : 'var(--faint)' }} />
      {card ? cardLabel(card) : 'Efectivo'}
    </span>
  )
}

function Expenses() {
  const { data, charges } = useMonthView()
  const open = useOverlay((s) => s.open)
  const [filter, setFilter] = useState<string>('all')
  const [scope, setScope] = useState<ExpenseScope | 'all'>('all')
  const cardById = new Map(data.cards.map((c) => [c.id, c]))
  const list = charges
    .filter((c) => c.kind === 'variable' && (filter === 'all' || (c.cardId ?? 'cash') === filter) && (scope === 'all' || c.scope === scope))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
  const total = toBase(sumByCurrency(list), data.settings)
  // Todo lo que se cobra en el mes (variables, fijos y cuotas), separado por tipo.
  const byScope = SCOPES.map((s) => ({ ...s, total: toBase(sumByCurrency(charges.filter((c) => c.scope === s.value)), data.settings) }))

  return (
    <>
      <div className="card scope-summary">
        {byScope.map((s) => (
          <button key={s.value} className={`scope-cell ${scope === s.value ? 'on' : ''}`} onClick={() => setScope(scope === s.value ? 'all' : s.value)}>
            <span className="lbl">
              <span className={`scope-dot ${s.value}`} />
              {s.label}
            </span>
            <span className="val num">
              <Money amount={s.total} currency={data.settings.baseCurrency} compact />
            </span>
          </button>
        ))}
      </div>
      <div className="choice-row" style={{ marginBottom: 12 }}>
        {[{ id: 'all', label: 'Todas' }, ...data.cards.map((c) => ({ id: c.id, label: cardLabel(c) })), { id: 'cash', label: 'Efectivo' }].map((c) => (
          <button key={c.id} className={`choice ${filter === c.id ? 'on' : ''}`} onClick={() => setFilter(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="card">
        <div className="card-head">
          <span className="title">{scope === 'all' ? 'Gastos variables' : `Gastos · ${SCOPES.find((s) => s.value === scope)!.label}`}</span>
          <span className="num" style={{ fontWeight: 600 }}><Money amount={total} currency={data.settings.baseCurrency} compact /></span>
        </div>
        {list.length === 0 ? (
          <Empty text="No hay gastos que se cobren en este mes." />
        ) : (
          <div className="list">
            {list.map((c) => (
              <button key={c.sourceId} className="list-item" onClick={() => open({ kind: 'expense', id: c.sourceId })}>
                <ExpenseIcon description={c.description} category={c.category} />
                <div className="li-main">
                  <div className="li-title">{c.description}</div>
                  <div className="li-sub">
                    <CardTag card={c.cardId ? cardById.get(c.cardId) : undefined} />·<span>compra {dateLabel(c.date!)}</span>
                    {c.category && <span className="chip">{c.category}</span>}
                    {c.scope !== 'personal' && <span className={`chip scope ${c.scope}`}>{SCOPES.find((s) => s.value === c.scope)!.label}</span>}
                  </div>
                </div>
                <div className="li-amount"><Money amount={c.amount} currency={c.currency} /></div>
              </button>
            ))}
          </div>
        )}
      </div>
      <AddButton label="Agregar gasto" onClick={() => open({ kind: 'quick' })} />
      <button className="pill-btn glass block import-btn" onClick={() => open({ kind: 'import' })}>
        <FileUp /> Importar estado de cuenta (PDF)
      </button>
    </>
  )
}

function Incomes() {
  const { data, month } = useMonthView()
  const open = useOverlay((s) => s.open)
  const base = data.settings.baseCurrency
  const accountName = (id?: string | null) => {
    const c = data.cards.find((x) => x.id === id)
    return c ? cardLabel(c) : null
  }
  const list = data.incomes.filter((i) => monthOf(i.date) === month).sort((a, b) => a.date.localeCompare(b.date))
  const expected = list.filter((i) => !isReceived(i))
  const today = todayKey()

  return (
    <>
      {expected.length > 0 && (
        <div className="card expected-card" style={{ marginBottom: 12 }}>
          <div className="card-head">
            <span className="title">Por recibir</span>
            <span className="num" style={{ fontWeight: 600 }}>
              <Amounts items={amountsFor(sumByCurrency(expected))} compact />
            </span>
          </div>
          <div className="list">
            {expected.map((i) => (
              <button key={i.id} className="list-item" onClick={() => open({ kind: 'income', id: i.id })}>
                <div className="li-main">
                  <div className="li-title">{i.description}</div>
                  <div className="li-sub">
                    <span>{dateLabel(i.date)}</span>
                    {accountName(i.accountId) && <span>· {accountName(i.accountId)}</span>}
                    <span className={`chip ${i.date <= today ? 'red' : 'purple'}`}>{i.date <= today ? 'Por confirmar' : 'Programado'}</span>
                  </div>
                </div>
                <div className="li-amount" style={{ color: 'var(--muted)' }}>
                  +<Money amount={i.amount} currency={i.currency} />
                </div>
              </button>
            ))}
          </div>
          {expected.some((i) => i.date <= today) && (
            <button className="pill-btn dark block" style={{ marginTop: 12, height: 42 }} onClick={() => open({ kind: 'confirmIncomes' })}>
              Confirmar los que ya llegaron
            </button>
          )}
        </div>
      )}
      {([1, 2] as const).map((q) => {
        const items = list.filter((i) => i.fortnight === q && isReceived(i))
        const total = toBase(sumByCurrency(items), data.settings)
        return (
          <div key={q} className="card" style={{ marginBottom: 12 }}>
            <div className="card-head">
              <span className="title">{q === 1 ? 'Primera quincena' : 'Segunda quincena'}</span>
              <span className="num" style={{ fontWeight: 600 }}><Money amount={total} currency={base} compact /></span>
            </div>
            {items.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>Sin ingresos recibidos.</div>
            ) : (
              <div className="list">
                {items.map((i) => (
                  <button key={i.id} className="list-item" onClick={() => open({ kind: 'income', id: i.id })}>
                    <div className="li-main">
                      <div className="li-title">{i.description}</div>
                      <div className="li-sub">
                        <span>{dateLabel(i.date)}</span>
                        {accountName(i.accountId) && <span>· {accountName(i.accountId)}</span>}
                      </div>
                    </div>
                    <div className="li-amount" style={{ color: 'var(--green)' }}>+<Money amount={i.amount} currency={i.currency} /></div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <AddButton label="Agregar ingreso" onClick={() => open({ kind: 'quick', preset: { kind: 'income' } })} />
    </>
  )
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="pill-btn dark block" style={{ marginTop: 14 }} onClick={onClick}>
      <Plus /> {label}
    </button>
  )
}
