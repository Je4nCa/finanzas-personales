import { Check, Clock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { cardLabel } from '../domain/cards'
import { dateLabel, todayKey } from '../domain/dates'
import { dueExpectedIncomes, formatMoney } from '../domain/finance'
import type { Card, Income } from '../domain/types'
import { snoozeIncome } from '../lib/snooze'
import { useData } from '../store/store'
import { useOverlay } from '../store/ui'
import { MoneyInput, Sheet } from './ui'

/** "¿Llegó este ingreso?" para los programados cuya fecha ya pasó. */
export function ConfirmIncomes() {
  const { incomes, cards, upsert, remove } = useData()
  const { close, showToast } = useOverlay()
  // Se fija la lista al abrir: los que se van respondiendo desaparecen sin reordenar.
  const [ids] = useState(() => dueExpectedIncomes(incomes, todayKey()).map((i) => i.id))
  const [answered, setAnswered] = useState<string[]>([])
  const pending = ids.map((id) => incomes.find((i) => i.id === id)).filter((i): i is Income => !!i && i.status === 'expected' && !answered.includes(i.id))

  const done = (id: string, msg?: string) => {
    setAnswered((a) => [...a, id])
    if (msg) showToast(msg)
    if (pending.length <= 1) close()
  }

  return (
    <Sheet title="¿Llegaron estos ingresos?" onClose={close}>
      <div className="form">
        {pending.length === 0 && <p className="fine-print">No hay ingresos por confirmar.</p>}
        {pending.map((i) => (
          <ConfirmCard
            key={i.id}
            income={i}
            account={cards.find((c) => c.id === i.accountId)}
            onConfirm={(amount) => {
              upsert('incomes', { ...i, amount, status: 'received', createdAt: new Date().toISOString() })
              done(i.id, `${i.description}: ${formatMoney(amount, i.currency)} confirmado`)
            }}
            onSnooze={() => {
              snoozeIncome(i.id)
              done(i.id, 'Te lo pregunto mañana')
            }}
            onDelete={() => {
              if (!confirm(`¿Borrar el ingreso programado de ${i.description}?`)) return
              remove('incomes', i.id)
              done(i.id, 'Ingreso borrado')
            }}
          />
        ))}
      </div>
    </Sheet>
  )
}

function ConfirmCard({
  income: i,
  account,
  onConfirm,
  onSnooze,
  onDelete,
}: {
  income: Income
  account?: Card
  onConfirm: (amount: number) => void
  onSnooze: () => void
  onDelete: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState(String(i.amount))
  const n = Math.round((parseFloat(amount) || 0) * 100) / 100
  return (
    <div className="card confirm-card">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="title" style={{ fontWeight: 600 }}>{i.description}</div>
          <div className="card-label" style={{ fontSize: 12.5 }}>
            {dateLabel(i.date)}
            {account ? ` · a ${cardLabel(account)}` : ''}
          </div>
        </div>
        <div className="num confirm-amount">+{formatMoney(i.amount, i.currency)}</div>
      </div>
      {editing ? (
        <div className="form" style={{ marginTop: 12 }}>
          <MoneyInput amount={amount} currency={i.currency} locked onAmount={setAmount} onCurrency={() => {}} autoFocus />
          <div className="form-actions">
            <button className="pill-btn glass block" onClick={() => setEditing(false)}>
              Cancelar
            </button>
            <button className="pill-btn dark block" disabled={n <= 0} onClick={() => onConfirm(n)}>
              Llegó {n > 0 ? formatMoney(n, i.currency) : ''}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="form-actions" style={{ marginTop: 12 }}>
            <button className="pill-btn dark block" onClick={() => onConfirm(i.amount)}>
              <Check /> Sí, llegó
            </button>
            <button className="pill-btn glass block" onClick={() => setEditing(true)}>
              Otro monto
            </button>
          </div>
          <div className="row" style={{ marginTop: 8, justifyContent: 'space-between' }}>
            <button className="pill-btn glass" onClick={onSnooze}>
              <Clock /> Todavía no
            </button>
            <button className="pill-btn glass danger" onClick={onDelete}>
              <Trash2 /> No va a llegar
            </button>
          </div>
        </>
      )}
    </div>
  )
}
