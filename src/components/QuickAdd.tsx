import { Mic, Sparkles, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dateLabel, monthLabel, todayKey } from '../domain/dates'
import { defaultAccount, fixedCurrency, isCredit } from '../domain/cards'
import { convert, formatMoney, paymentMonthFor } from '../domain/finance'
import { parseExpense, suggestedCard } from '../domain/parseExpense'
import type { Currency, Expense, ExpenseScope, Income } from '../domain/types'
import { newId, useData } from '../store/store'
import { useOverlay, type SheetState } from '../store/ui'
import { CATEGORIES } from './forms'
import { AccountPicker, CardPicker, Field, MoneyInput, ScopePicker, Segmented, Sheet } from './ui'

// Web Speech API: Safari y Chrome la exponen con prefijo.
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}
const getRecognition = (): (new () => Recognition) | undefined =>
  (window as never)['SpeechRecognition'] ?? (window as never)['webkitSpeechRecognition']

const VOICE_LANGS = ['es-CR', 'es-419', 'es-MX', 'es-ES']

const KEYBOARD = 'Usá el dictado del teclado en el campo de texto.'
const VOICE_ERRORS: Record<string, string> = {
  'no-speech': 'No escuché nada. Probá otra vez.',
  'not-allowed': `El navegador o el sistema bloqueó el micrófono. Revisá el permiso del sitio y, en Mac, Ajustes del Sistema → Privacidad → Micrófono. ${KEYBOARD}`,
  'service-not-allowed': `El reconocimiento de voz está apagado en este navegador. En Mac/iPhone activá Dictado en Ajustes → Teclado. ${KEYBOARD}`,
  network: `Este navegador no tiene servicio de reconocimiento de voz (pasa en Brave, Arc y otros). Probá en Safari o Chrome. ${KEYBOARD}`,
  'audio-capture': `No encontré ningún micrófono conectado. ${KEYBOARD}`,
  'language-not-supported': `Este navegador no reconoce español. ${KEYBOARD}`,
}

const EXAMPLES = ['25 mil en el súper con la BAC', 'Uber 4800 ayer', 'Me ingresaron 500 mil de Montevo', 'almuerzo 6500 en efectivo']

type Kind = 'expense' | 'income'
type Overrides = Partial<{ kind: Kind; description: string; amount: string; currency: Currency; cardId: string | null; accountId: string | null; category: string; scope: ExpenseScope; date: string; fortnight: 1 | 2 }>

export function QuickAdd({ preset }: SheetState) {
  const { cards, expenses, incomes, settings, upsert } = useData()
  const { close, open, showToast } = useOverlay()
  const [text, setText] = useState((preset?.text as string) ?? '')
  const [over, setOver] = useState<Overrides>({})
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const recRef = useRef<Recognition | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(
    () => parseExpense(text, { cards, history: expenses, incomes, baseCurrency: settings.baseCurrency, today: todayKey() }),
    [text, cards, expenses, incomes, settings.baseCurrency],
  )

  // La frase decide si es gasto o ingreso; abrir desde "Ingreso" o tocar el selector lo fija.
  const kind: Kind = over.kind ?? (parsed.kind === 'income' ? 'income' : ((preset?.kind as Kind) ?? 'expense'))
  const isIncome = kind === 'income'

  const description =
    over.description ?? (isIncome && parsed.kind === 'expense' ? parsed.description || 'Ingreso' : parsed.description || (!isIncome && parsed.found.category ? parsed.category : ''))
  const amountStr = over.amount ?? (parsed.amount !== null ? String(parsed.amount) : '')
  const currency = over.currency ?? parsed.currency
  const cardId = over.cardId !== undefined ? over.cardId : parsed.cardId !== undefined ? parsed.cardId : suggestedCard(cards, expenses)
  const category = over.category ?? parsed.category
  const scope = over.scope ?? parsed.scope
  const date = over.date ?? parsed.date
  const fortnight: 1 | 2 = over.fortnight ?? (Number(date.slice(8, 10)) <= 15 ? 1 : 2)
  // Tarjeta de una sola moneda: el gasto queda en esa moneda. Si se dijo en la otra, se convierte
  // con el tipo de cambio como aproximación (el monto real es el que diga el estado de cuenta).
  // Ingreso: a qué cuenta entró (la mencionada si es de débito/cuenta, si no la habitual).
  const spokenAccount = parsed.cardId && cards.some((c) => c.id === parsed.cardId && !isCredit(c)) ? parsed.cardId : undefined
  const accountId = over.accountId !== undefined ? over.accountId : (spokenAccount ?? defaultAccount(cards, incomes))
  const lockCur = fixedCurrency(cards.find((c) => c.id === (isIncome ? accountId : cardId)))
  const converted = !!lockCur && over.amount === undefined && parsed.amount !== null && currency !== lockCur
  const finalAmountStr = converted ? String(Math.round(convert(parsed.amount!, currency, lockCur!, settings.exchangeRate) * 100) / 100) : amountStr
  const finalCurrency = lockCur ?? currency
  const amount = parseFloat(finalAmountStr)
  const valid = amount > 0 && !!description.trim()
  const card = cards.find((c) => c.id === cardId)

  const startVoice = (langIndex = 0) => {
    setVoiceError(null)
    const SpeechRecognitionCtor = getRecognition()
    if (!SpeechRecognitionCtor) {
      setVoiceError('Este navegador no tiene reconocimiento de voz. Tocá el campo de texto y usá el dictado del teclado.')
      inputRef.current?.focus()
      return
    }
    const rec = new SpeechRecognitionCtor()
    rec.lang = VOICE_LANGS[langIndex]
    rec.interimResults = true
    rec.continuous = false
    let retry = false
    rec.onresult = (e) => {
      const t = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ')
      setText(t)
      setOver({})
    }
    rec.onerror = (e) => {
      // Si el navegador no tiene español de Costa Rica, se prueba la siguiente variante.
      if (e.error === 'language-not-supported' && langIndex + 1 < VOICE_LANGS.length) {
        retry = true
        return
      }
      setListening(false)
      if (e.error === 'aborted') return
      setVoiceError(`${VOICE_ERRORS[e.error] ?? 'No se pudo usar el reconocimiento de voz.'} (${e.error})`)
      if (e.error !== 'no-speech') inputRef.current?.focus()
    }
    rec.onend = () => {
      if (retry) startVoice(langIndex + 1)
      else setListening(false)
    }
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
    } catch {
      setVoiceError('No se pudo iniciar el micrófono.')
    }
  }

  const stopVoice = () => recRef.current?.stop()

  useEffect(() => () => recRef.current?.stop(), [])

  // La categoría y tarjeta elegidas pueden quedar fuera de la fila deslizable: se centran.
  const parsedRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    parsedRef.current?.querySelectorAll('.choice-row .choice.on').forEach((el) => el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }))
  }, [category, cardId, text])

  const save = () => {
    if (!valid) return
    if (isIncome) {
      const inc: Income = {
        id: newId(),
        description: description.trim(),
        amount: Math.round(amount * 100) / 100,
        currency: finalCurrency,
        date,
        fortnight,
        accountId,
        createdAt: new Date().toISOString(),
      }
      upsert('incomes', inc)
      close()
      showToast(`Ingreso de ${inc.description} guardado`)
      return
    }
    const exp: Expense = {
      id: newId(),
      description: description.trim(),
      amount: Math.round(amount * 100) / 100,
      currency: finalCurrency,
      date,
      cardId: cardId ?? null,
      category,
      scope,
      createdAt: new Date().toISOString(),
    }
    upsert('expenses', exp)
    close()
    showToast(`${exp.description} guardado`)
  }

  const set = (patch: Overrides) => setOver((o) => ({ ...o, ...patch }))

  return (
    <Sheet title={isIncome ? 'Ingreso rápido' : 'Gasto rápido'} onClose={close}>
      <div className="form">
        <div className="voice">
          <button className={`mic ${listening ? 'on' : ''}`} onClick={() => (listening ? stopVoice() : startVoice())} aria-label={listening ? 'Detener' : 'Dictar gasto o ingreso'}>
            <span className="mic-ring" />
            <span className="mic-ring delay" />
            <span className="mic-core">{listening ? <Square /> : <Mic />}</span>
          </button>
          <div className="voice-hint">{listening ? 'Escuchando…' : 'Tocá y decí un gasto o un ingreso'}</div>
        </div>

        <Segmented
          value={kind}
          onChange={(k) => set({ kind: k })}
          options={[
            { value: 'expense', label: 'Gasto' },
            { value: 'income', label: 'Ingreso' },
          ]}
        />

        <input
          ref={inputRef}
          className="input"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOver((o) => ({ kind: o.kind }))
          }}
          placeholder={`Ej. ${EXAMPLES[0]}`}
          // En la Mac (mouse/trackpad) se escribe directo; en el iPhone no se abre el teclado solo.
          autoFocus={matchMedia('(pointer: fine)').matches}
          enterKeyHint="done"
          onKeyDown={(e) => e.key === 'Enter' && valid && save()}
        />
        {voiceError && <div className="chip red" style={{ alignSelf: 'flex-start', whiteSpace: 'normal', padding: '6px 10px' }}>{voiceError}</div>}

        {!text ? (
          <div className="choice-row" style={{ flexWrap: 'wrap' }}>
            {EXAMPLES.map((ex) => (
              <button key={ex} className="choice" style={{ fontSize: 13, height: 34 }} onClick={() => setText(ex)}>
                {ex}
              </button>
            ))}
          </div>
        ) : (
          <div className="card parsed" ref={parsedRef}>
            <div className="parsed-head">
              <Sparkles size={15} /> Entendí esto, tocá lo que quieras cambiar
            </div>
            <input className="parsed-title" value={description} onChange={(e) => set({ description: e.target.value })} placeholder="Descripción" />
            <div className={isIncome ? 'income-amount' : ''}>
              <MoneyInput
                amount={finalAmountStr}
                currency={finalCurrency}
                locked={!!lockCur}
                onAmount={(v) => set({ amount: v })}
                onCurrency={(c) => set({ currency: c })}
              />
              {converted && (
                <div className="chip purple" style={{ whiteSpace: 'normal', marginTop: 8 }}>
                  Esta tarjeta cobra en {lockCur === 'CRC' ? 'colones' : 'dólares'}: convertí {formatMoney(parsed.amount!, currency)} con tu tipo de cambio. Ajustalo al monto del estado de cuenta.
                </div>
              )}
            </div>
            {isIncome ? (
              <>
              <Field label="¿A qué cuenta entró?">
                <AccountPicker cards={cards} value={accountId} onChange={(id) => set({ accountId: id })} />
              </Field>
              <Field label="Quincena">
                <Segmented
                  value={String(fortnight) as '1' | '2'}
                  onChange={(v) => set({ fortnight: v === '1' ? 1 : 2 })}
                  options={[
                    { value: '1', label: 'Primera (1–15)' },
                    { value: '2', label: 'Segunda (16–fin)' },
                  ]}
                />
              </Field>
              </>
            ) : (
              <>
            <Field label="Tarjeta">
              <CardPicker cards={cards} value={cardId ?? null} onChange={(id) => set({ cardId: id })} />
            </Field>
            <Field label="Categoría">
              <div className="choice-row">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" className={`choice ${category === c ? 'on' : ''}`} onClick={() => set({ category: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Tipo de gasto">
              <ScopePicker value={scope} onChange={(v) => set({ scope: v })} small />
            </Field>
              </>
            )}
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="chip">{date === todayKey() ? 'Hoy' : dateLabel(date)}</span>
              {isIncome ? (
                <span className="chip green">Suma a {monthLabel(date.slice(0, 7))}</span>
              ) : (
                <span className="chip purple">
                  {card && isCredit(card) ? `Se cobra en ${monthLabel(paymentMonthFor(card, date))}` : `Cuenta en ${monthLabel(date.slice(0, 7))}`}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="form-actions">
          <button
            className="pill-btn glass block"
            onClick={() =>
              open(
                isIncome
                  ? { kind: 'income', preset: { description, amount: finalAmountStr, currency: finalCurrency, date, fortnight, accountId } }
                  : { kind: 'expense', preset: { description, amount: finalAmountStr, currency: finalCurrency, cardId: cardId ?? null, category, scope, date } },
              )
            }
          >
            Más detalles
          </button>
          <button className="pill-btn dark block" disabled={!valid} style={{ opacity: valid ? 1 : 0.4 }} onClick={save}>
            Guardar
          </button>
        </div>
      </div>
    </Sheet>
  )
}
