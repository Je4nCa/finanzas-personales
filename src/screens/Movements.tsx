import { FileUp, Plus } from 'lucide-react'
import { useState } from 'react'
import { dateLabel, monthLabel, monthOf } from '../domain/dates'
import { sumByCurrency, toBase } from '../domain/finance'
import { cardLabel } from '../domain/cards'
import type { Card, ExpenseScope } from '../domain/types'
import { ExpenseIcon } from '../components/logos'
import { cardSwatch, Empty, Money, MonthNav, SCOPES, Segmented } from '../components/ui'
import { useOverlay } from '../store/ui'
import { useMonthView } from '../store/useMonth'

type View = 'gastos' | 'fijos' | 'ingresos'

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
          { value: 'fijos', label: 'Fijos' },
          { value: 'ingresos', label: 'Ingresos' },
        ]}
      />
      {view === 'gastos' && <Expenses />}
      {view === 'fijos' && <Fixed />}
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

function Fixed() {
  const { data, month } = useMonthView()
  const open = useOverlay((s) => s.open)
  const cardById = new Map(data.cards.map((c) => [c.id, c]))
  const isActive = (f: (typeof data.fixed)[number]) => f.startMonth <= month && (!f.endMonth || f.endMonth >= month)
  const list = [...data.fixed].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || a.description.localeCompare(b.description))
  const total = toBase(sumByCurrency(list.filter(isActive)), data.settings)

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="title">Gastos fijos mensuales</span>
          <span className="num" style={{ fontWeight: 600 }}><Money amount={total} currency={data.settings.baseCurrency} compact /></span>
        </div>
        {list.length === 0 ? (
          <Empty text="Agregá tus suscripciones y servicios: Netflix, internet, gimnasio…" />
        ) : (
          <div className="list">
            {list.map((f) => {
              const active = isActive(f)
              return (
                <button key={f.id} className="list-item" onClick={() => open({ kind: 'fixed', id: f.id })} style={{ opacity: active ? 1 : 0.5 }}>
                  <ExpenseIcon description={f.description} />
                  <div className="li-main">
                    <div className="li-title">{f.description}</div>
                    <div className="li-sub">
                      <CardTag card={f.cardId ? cardById.get(f.cardId) : undefined} />
                      {f.endMonth ? <span>· hasta {monthLabel(f.endMonth)}</span> : null}
                      {!active && <span className="chip">{f.startMonth > month ? 'Aún no inicia' : 'Terminado'}</span>}
                    </div>
                  </div>
                  <div className="li-amount">
                    <Money amount={f.amount} currency={f.currency} />
                    <small>al mes</small>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
      <AddButton label="Agregar gasto fijo" onClick={() => open({ kind: 'fixed' })} />
    </>
  )
}

function Incomes() {
  const { data, month } = useMonthView()
  const open = useOverlay((s) => s.open)
  const base = data.settings.baseCurrency
  const list = data.incomes.filter((i) => monthOf(i.date) === month).sort((a, b) => a.date.localeCompare(b.date))

  return (
    <>
      {([1, 2] as const).map((q) => {
        const items = list.filter((i) => i.fortnight === q)
        const total = toBase(sumByCurrency(items), data.settings)
        return (
          <div key={q} className="card" style={{ marginBottom: 12 }}>
            <div className="card-head">
              <span className="title">{q === 1 ? 'Primera quincena' : 'Segunda quincena'}</span>
              <span className="num" style={{ fontWeight: 600 }}><Money amount={total} currency={base} compact /></span>
            </div>
            {items.length === 0 ? (
              <div style={{ color: 'var(--muted)', fontSize: 13.5 }}>Sin ingresos registrados.</div>
            ) : (
              <div className="list">
                {items.map((i) => (
                  <button key={i.id} className="list-item" onClick={() => open({ kind: 'income', id: i.id })}>
                    <div className="li-main">
                      <div className="li-title">{i.description}</div>
                      <div className="li-sub">{dateLabel(i.date)}</div>
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
