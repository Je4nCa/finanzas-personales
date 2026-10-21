import { AlertTriangle, Check, CheckCircle2, FileText, Upload } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { dateLabel, monthLabel } from '../domain/dates'
import { formatMoney } from '../domain/finance'
import { suggestFor } from '../domain/parseExpense'
import type { Card, CardNetwork, Currency, Expense, ExpenseScope, Income } from '../domain/types'
import type { Statement, StatementGroup, StatementRow } from '../lib/statements'
import { newId, useData, useUi } from '../store/store'
import { useOverlay } from '../store/ui'
import { CATEGORIES } from './forms'
import { cardSwatch, ScopePicker, SCOPES, Segmented, Sheet } from './ui'

type Phase = { step: 'pick' } | { step: 'reading'; name: string } | { step: 'error'; message: string } | { step: 'review'; statement: Statement; name: string }

interface RowState {
  selected: boolean
  description: string
  amount: string
  category: string
  scope: ExpenseScope
  kind: 'expense' | 'income'
  /** 'imported' = ya está en la app; 'possible' = parece un gasto anotado a mano. */
  duplicate?: 'imported' | 'possible'
}

/** Destino de cada tarjeta del estado: una tarjeta existente, una nueva, o efectivo/débito. */
type Target = { type: 'card'; id: string } | { type: 'new' } | { type: 'cash' }

const BRAND_NETWORK: Record<string, CardNetwork> = { VISA: 'visa', MASTERCARD: 'mastercard', 'AMERICAN EXPRESS': 'amex' }
const BRAND_LABEL: Record<string, string> = { VISA: 'Visa', MASTERCARD: 'Mastercard', 'AMERICAN EXPRESS': 'Amex' }

async function readPdf(file: File): Promise<Statement> {
  const [pdfjs, { default: workerUrl }, { extractLines }, { parseStatement }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    import('../lib/pdfText'),
    import('../lib/statements'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return parseStatement(await extractLines(pdfjs as never, await file.arrayBuffer()))
}

const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

export function ImportSheet() {
  const close = useOverlay((s) => s.close)
  const [phase, setPhase] = useState<Phase>({ step: 'pick' })
  const fileRef = useRef<HTMLInputElement>(null)

  const onFile = async (file: File) => {
    setPhase({ step: 'reading', name: file.name })
    try {
      const statement = await readPdf(file)
      if (!statement.groups.length) {
        setPhase({ step: 'error', message: 'No encontré movimientos en este PDF. ¿Es un estado de cuenta en texto (no escaneado)?' })
        return
      }
      setPhase({ step: 'review', statement, name: file.name })
    } catch (e) {
      console.error(e)
      setPhase({ step: 'error', message: /password/i.test(String(e)) ? 'El PDF tiene contraseña. Abrilo, guardalo sin contraseña y probá de nuevo.' : 'No se pudo leer el PDF.' })
    }
  }

  return (
    <Sheet title="Importar estado de cuenta" onClose={close}>
      {phase.step === 'review' ? (
        <Review statement={phase.statement} fileName={phase.name} />
      ) : (
        <div className="form">
          <button className="drop-zone" onClick={() => fileRef.current?.click()} disabled={phase.step === 'reading'}>
            {phase.step === 'reading' ? <FileText /> : <Upload />}
            <strong>{phase.step === 'reading' ? `Leyendo ${phase.name}…` : 'Elegí el PDF del banco'}</strong>
            <span>BAC (tarjetas de crédito) y otros bancos como Wink</span>
          </button>
          {phase.step === 'error' && <div className="chip red" style={{ whiteSpace: 'normal', padding: '8px 10px' }}>{phase.message}</div>}
          <p className="fine-print">El PDF se lee en este dispositivo y no se sube a ningún lado. Solo se guardan los gastos que confirmes.</p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
        </div>
      )}
    </Sheet>
  )
}

function Review({ statement, fileName }: { statement: Statement; fileName: string }) {
  const { cards, expenses, incomes, upsert } = useData()
  const { close, showToast } = useOverlay()
  const setMonth = useUi((s) => s.setMonth)

  // Tarjeta de la app para cada grupo, por los últimos 4 dígitos.
  const [targets, setTargets] = useState<Target[]>(() =>
    statement.groups.map((g) => {
      const match = cards.find((c) => c.lastFour && g.last4s.includes(c.lastFour))
      if (match) return { type: 'card', id: match.id }
      return statement.bank === 'bac' ? { type: 'new' } : { type: 'cash' }
    }),
  )

  const [rows, setRows] = useState<Record<string, RowState>>(() => {
    const out: Record<string, RowState> = {}
    const refs = new Set([...expenses.map((e) => e.sourceRef), ...incomes.map((i) => i.sourceRef)].filter(Boolean))
    statement.groups.forEach((g, gi) => {
      const t = targets[gi] ?? { type: 'cash' }
      const cardId = t.type === 'card' ? t.id : null
      for (const r of g.rows) {
        const s = suggestFor(r.description, expenses)
        const possible =
          !refs.has(r.ref) &&
          expenses.some((e) => !e.sourceRef && e.cardId === cardId && e.currency === r.currency && Math.abs(e.amount - r.amount) < 0.01 && dayDiff(e.date, r.date) <= 3)
        const duplicate = refs.has(r.ref) ? 'imported' : possible ? 'possible' : undefined
        out[r.ref] = {
          selected: !duplicate && r.section !== 'interes',
          description: r.description,
          amount: String(Math.abs(r.amount)),
          category: s.category,
          // Las compras de la tarjeta adicional (pareja) arrancan como "Pareja"; igual se revisan una por una.
          scope: s.scope ?? (r.holder ? 'pareja' : 'personal'),
          kind: r.kind,
          duplicate,
        }
      }
    })
    return out
  })

  const setRow = (ref: string, patch: Partial<RowState>) => setRows((rs) => ({ ...rs, [ref]: { ...rs[ref], ...patch } }))
  const allRows = statement.groups.flatMap((g) => g.rows)
  const selected = allRows.filter((r) => rows[r.ref].selected)

  const setAll = (patch: Partial<RowState>, only?: (r: StatementRow) => boolean) =>
    setRows((rs) => {
      const next = { ...rs }
      for (const r of allRows) if (!only || only(r)) next[r.ref] = { ...next[r.ref], ...patch }
      return next
    })

  const totals = useMemo(() => {
    const t: Record<Currency, number> = { CRC: 0, USD: 0 }
    for (const r of selected) {
      const st = rows[r.ref]
      const n = parseFloat(st.amount) || 0
      t[r.currency] += st.kind === 'income' ? 0 : r.amount < 0 ? -n : n
    }
    return t
  }, [selected, rows])

  const doImport = () => {
    const cardIds = targets.map((t, gi) => {
      if (t.type === 'card') return t.id
      if (t.type === 'cash') return null
      const g = statement.groups[gi]
      const card = newCardFor(g, cards.length + gi)
      upsert('cards', card)
      return card.id
    })
    let nExp = 0
    let nInc = 0
    statement.groups.forEach((g, gi) => {
      for (const r of g.rows) {
        const st = rows[r.ref]
        if (!st.selected) continue
        const n = Math.round((parseFloat(st.amount) || 0) * 100) / 100
        if (!n) continue
        if (st.kind === 'income') {
          upsert('incomes', {
            id: newId(),
            description: st.description.trim() || 'Ingreso',
            amount: n,
            currency: r.currency,
            date: r.date,
            fortnight: Number(r.date.slice(8, 10)) <= 15 ? 1 : 2,
            sourceRef: r.ref,
          } satisfies Income)
          nInc++
        } else {
          upsert('expenses', {
            id: newId(),
            description: st.description.trim() || 'Gasto',
            amount: r.amount < 0 ? -n : n,
            currency: r.currency,
            date: r.date,
            cardId: cardIds[gi],
            category: st.category,
            scope: st.scope,
            paymentMonth: cardIds[gi] ? (g.paymentMonth ?? null) : null,
            sourceRef: r.ref,
          } satisfies Expense)
          nExp++
        }
      }
    })
    const month = statement.groups.find((g) => g.paymentMonth)?.paymentMonth
    if (month) setMonth(month)
    close()
    showToast(`Importados ${nExp} gastos${nInc ? ` y ${nInc} ingresos` : ''}`)
  }

  return (
    <div className="import">
      <div className="import-file">
        <FileText size={16} /> {fileName}
      </div>

      <div className="import-bulk">
        <span className="card-label">Marcar seleccionados como</span>
        <div className="choice-row">
          {SCOPES.map((s) => (
            <button key={s.value} className="choice" onClick={() => setAll({ scope: s.value }, (r) => rows[r.ref].selected)}>
              <span className={`scope-dot ${s.value}`} /> {s.label}
            </button>
          ))}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="pill-btn glass" onClick={() => setAll({ selected: true }, (r) => rows[r.ref].duplicate !== 'imported')}>
            Seleccionar todo
          </button>
          <button className="pill-btn glass" onClick={() => setAll({ selected: false })}>
            Ninguno
          </button>
        </div>
      </div>

      {statement.groups.map((g, gi) => (
        <GroupReview
          key={gi}
          group={g}
          generic={statement.bank === 'generic'}
          target={targets[gi]}
          onTarget={(t) => setTargets((ts) => ts.map((x, i) => (i === gi ? t : x)))}
          rows={rows}
          setRow={setRow}
        />
      ))}

      <div className="import-footer">
        <div className="import-total">
          <span>{selected.length} seleccionados</span>
          <strong className="num">
            {formatMoney(totals.CRC, 'CRC')}
            {totals.USD ? ` + ${formatMoney(totals.USD, 'USD')}` : ''}
          </strong>
        </div>
        <button className="pill-btn dark block" disabled={!selected.length} style={{ opacity: selected.length ? 1 : 0.4 }} onClick={doImport}>
          Importar {selected.length}
        </button>
      </div>
    </div>
  )
}

/** Últimos 4 de la tarjeta del titular: en Amex el número de cuenta y el del plástico difieren. */
const plasticLast4 = (g: StatementGroup) => (BRAND_NETWORK[g.brand] === 'amex' && g.last4s[1] ? g.last4s[1] : (g.last4s[0] ?? ''))

const exact = (n: number, c: Currency) => `${c === 'USD' ? '$' : '₡'}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function newCardFor(g: StatementGroup, theme: number): Card {
  const network = BRAND_NETWORK[g.brand] ?? null
  const closing = g.closingDate ? Number(g.closingDate.slice(8, 10)) : 1
  const payment = g.paymentDate ? Number(g.paymentDate.slice(8, 10)) : 15
  const lastFour = plasticLast4(g)
  return {
    id: newId(),
    name: `BAC ${BRAND_LABEL[g.brand] ?? g.brand}`,
    lastFour,
    closingDay: closing,
    paymentDay: payment,
    theme: theme % 6,
    network,
    bank: 'bac',
  }
}

function GroupReview({
  group: g,
  generic,
  target,
  onTarget,
  rows,
  setRow,
}: {
  group: StatementGroup
  generic: boolean
  target: Target
  onTarget: (t: Target) => void
  rows: Record<string, RowState>
  setRow: (ref: string, patch: Partial<RowState>) => void
}) {
  const cards = useData((s) => s.cards)
  const sel = g.rows.filter((r) => rows[r.ref].selected).length
  // Comprobación contra el total que declara el banco (solo compras y créditos, sin intereses).
  const read = { CRC: 0, USD: 0 }
  for (const r of g.rows) if (r.section !== 'interes') read[r.currency] += r.amount
  const declared = g.declaredTotals
  const matches = declared && (['CRC', 'USD'] as Currency[]).every((c) => Math.abs((declared[c] ?? 0) - read[c]) < 0.01)
  const preview = target.type === 'new' ? newCardFor(g, 0) : null

  return (
    <section className="card import-group">
      <div className="card-head">
        <span className="icon-tile" style={{ background: cardSwatch(cards.length), border: 0 }}>
          <FileText color="#fff" />
        </span>
        <div className="spacer" style={{ minWidth: 0 }}>
          <div className="title">
            {generic ? 'Movimientos' : `${BRAND_LABEL[g.brand] ?? g.brand} ${plasticLast4(g) ? `· ****${plasticLast4(g)}` : ''}`}
          </div>
          <div className="card-label" style={{ fontSize: 12.5 }}>
            {g.paymentMonth ? `Se cobra en ${monthLabel(g.paymentMonth)}` : `${g.rows.length} movimientos`} · {sel}/{g.rows.length} seleccionados
          </div>
        </div>
      </div>

      {declared && (
        <div className={`import-check ${matches ? 'ok' : 'warn'}`}>
          {matches ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {matches
            ? `Coincide con el total del banco: ${exact(declared.CRC ?? 0, 'CRC')}${declared.USD ? ` + ${exact(declared.USD, 'USD')}` : ''}`
            : `Leí ${exact(read.CRC, 'CRC')} y el banco dice ${exact(declared.CRC ?? 0, 'CRC')}: revisá los montos.`}
        </div>
      )}

      <div className="import-target">
        <span className="card-label">Tarjeta en la app</span>
        <select
          className="input"
          value={target.type === 'card' ? target.id : target.type}
          onChange={(e) => onTarget(e.target.value === 'new' ? { type: 'new' } : e.target.value === 'cash' ? { type: 'cash' } : { type: 'card', id: e.target.value })}
        >
          {cards.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.lastFour ? `****${c.lastFour}` : ''}
            </option>
          ))}
          {!generic && <option value="new">Crear {preview?.name ?? 'tarjeta nueva'} {preview?.lastFour ? `****${preview.lastFour}` : ''}</option>}
          <option value="cash">Efectivo / débito (sin tarjeta)</option>
        </select>
        {preview && (
          <span className="card-label" style={{ fontSize: 12 }}>
            Se crea con cierre el día {preview.closingDay} y pago el día {preview.paymentDay}.
          </span>
        )}
      </div>

      <div className="import-rows">
        {g.rows.map((r) => (
          <RowEditor key={r.ref} row={r} state={rows[r.ref]} generic={generic} onChange={(p) => setRow(r.ref, p)} />
        ))}
      </div>
    </section>
  )
}

function RowEditor({ row: r, state: st, generic, onChange }: { row: StatementRow; state: RowState; generic: boolean; onChange: (p: Partial<RowState>) => void }) {
  const credit = r.amount < 0
  const [editing, setEditing] = useState(false)
  return (
    <div className={`import-row ${st.selected ? '' : 'off'}`}>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <button className={`check ${st.selected ? 'on' : ''}`} onClick={() => onChange({ selected: !st.selected })} aria-label={st.selected ? 'Quitar' : 'Incluir'}>
          {st.selected && <Check />}
        </button>
        <div className="spacer" style={{ minWidth: 0 }}>
          <input className="import-desc" value={st.description} onChange={(e) => onChange({ description: e.target.value })} />
          <div className="li-sub">
            <span>{dateLabel(r.date)}</span>
            {r.place && <span>· {r.place}</span>}
            {r.holder && <span className="chip scope pareja">{r.holder}</span>}
            {r.section === 'interes' && <span className="chip">Intereses</span>}
            {credit && <span className="chip green">Crédito</span>}
            {st.duplicate === 'imported' && <span className="chip">Ya importado</span>}
            {st.duplicate === 'possible' && <span className="chip red">¿Ya lo anotaste?</span>}
          </div>
        </div>
        <div className="import-amount">
          {editing ? (
            <>
              <span>{credit ? '−' : ''}{r.currency === 'USD' ? '$' : '₡'}</span>
              <input
                className="num"
                inputMode="decimal"
                autoFocus
                size={Math.max(4, st.amount.length + 1)}
                value={st.amount}
                onChange={(e) => onChange({ amount: e.target.value.replace(/[^\d.]/g, '') })}
                onBlur={() => setEditing(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditing(false)}
                aria-label="Monto"
              />
            </>
          ) : (
            <button className={`num ${credit ? 'credit' : ''}`} onClick={() => setEditing(true)} aria-label="Editar monto">
              {credit ? '−' : ''}
              {exact(parseFloat(st.amount) || 0, r.currency)}
            </button>
          )}
        </div>
      </div>
      {st.selected && (
        <div className="import-row-opts">
          {generic && (
            <Segmented
              small
              value={st.kind}
              onChange={(k) => onChange({ kind: k })}
              options={[
                { value: 'expense', label: 'Gasto' },
                { value: 'income', label: 'Ingreso' },
              ]}
            />
          )}
          {st.kind === 'expense' && (
            <>
              <select className="input import-cat" value={st.category} onChange={(e) => onChange({ category: e.target.value })} aria-label="Categoría">
                {CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <ScopePicker small value={st.scope} onChange={(scope) => onChange({ scope })} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
