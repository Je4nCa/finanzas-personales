import { Mic, Sparkles, Square } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { dateLabel, monthLabel, todayKey } from '../domain/dates'
import { paymentMonthFor } from '../domain/finance'
import { parseExpense, suggestedCard } from '../domain/parseExpense'
import type { Currency, Expense } from '../domain/types'
import { newId, useData } from '../store/store'
import { useOverlay, type SheetState } from '../store/ui'
import { CATEGORIES } from './forms'
import { CardPicker, Field, MoneyInput, Sheet } from './ui'

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

const EXAMPLES = ['25 mil en el súper con la BAC', 'Uber 4800 ayer', 'Amazon $64.99 con la Mastercard', 'almuerzo 6500 en efectivo']

type Overrides = Partial<{ description: string; amount: string; currency: Currency; cardId: string | null; category: string; date: string }>

export function QuickAdd({ preset }: SheetState) {
  const { cards, expenses, settings, upsert } = useData()
  const { close, open, showToast } = useOverlay()
  const [text, setText] = useState((preset?.text as string) ?? '')
  const [over, setOver] = useState<Overrides>({})
  const [listening, setListening] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const recRef = useRef<Recognition | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const parsed = useMemo(
    () => parseExpense(text, { cards, history: expenses, baseCurrency: settings.baseCurrency, today: todayKey() }),
    [text, cards, expenses, settings.baseCurrency],
  )

  const description = over.description ?? (parsed.description || (parsed.found.category ? parsed.category : ''))
  const amountStr = over.amount ?? (parsed.amount !== null ? String(parsed.amount) : '')
  const currency = over.currency ?? parsed.currency
  const cardId = over.cardId !== undefined ? over.cardId : parsed.cardId !== undefined ? parsed.cardId : suggestedCard(cards, expenses)
  const category = over.category ?? parsed.category
  const date = over.date ?? parsed.date
  const amount = parseFloat(amountStr)
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
    const exp: Expense = {
      id: newId(),
      description: description.trim(),
      amount: Math.round(amount * 100) / 100,
      currency,
      date,
      cardId: cardId ?? null,
      category,
    }
    upsert('expenses', exp)
    close()
    showToast(`${exp.description} guardado`)
  }

  const set = (patch: Overrides) => setOver((o) => ({ ...o, ...patch }))

  return (
    <Sheet title="Gasto rápido" onClose={close}>
      <div className="form">
        <div className="voice">
          <button className={`mic ${listening ? 'on' : ''}`} onClick={() => (listening ? stopVoice() : startVoice())} aria-label={listening ? 'Detener' : 'Dictar gasto'}>
            <span className="mic-ring" />
            <span className="mic-ring delay" />
            <span className="mic-core">{listening ? <Square /> : <Mic />}</span>
          </button>
          <div className="voice-hint">{listening ? 'Escuchando…' : 'Tocá y decí tu gasto'}</div>
        </div>

        <input
          ref={inputRef}
          className="input"
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOver({})
          }}
          placeholder={`Ej. ${EXAMPLES[0]}`}
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
            <MoneyInput amount={amountStr} currency={currency} onAmount={(v) => set({ amount: v })} onCurrency={(c) => set({ currency: c })} />
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
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <span className="chip">{date === todayKey() ? 'Hoy' : dateLabel(date)}</span>
              <span className="chip purple">{card ? `Se cobra en ${monthLabel(paymentMonthFor(card, date))}` : 'Efectivo / débito'}</span>
            </div>
          </div>
        )}

        <div className="form-actions">
          <button
            className="pill-btn glass block"
            onClick={() =>
              open({
                kind: 'expense',
                preset: { description, amount: amountStr, currency, cardId: cardId ?? null, category, date },
              })
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
