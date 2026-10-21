import type { Card, Currency, DateKey, Expense, ExpenseScope, Income } from './types'

/**
 * Interpreta una frase dictada ("25 mil en el Pali con la BAC", "me ingresaron 500 mil de Montevo")
 * y extrae si es gasto o ingreso, descripción, monto, moneda, tarjeta, categoría y fecha. Todo local, sin red.
 */

export interface ParsedExpense {
  kind: 'expense' | 'income'
  description: string
  amount: number | null
  currency: Currency
  /** undefined = la frase no menciona tarjeta (se usa la sugerida). null = efectivo / débito. */
  cardId: string | null | undefined
  category: string
  /** Personal / casa / pareja: por frase ("en pareja", "para la casa") o por el historial. */
  scope: ExpenseScope
  date: DateKey
  /** Quincena según el día (para ingresos). */
  fortnight: 1 | 2
  /** Qué partes salieron de la frase (para resaltarlas en la vista previa). */
  found: { amount: boolean; currency: boolean; card: boolean; category: boolean; date: boolean }
}

export interface ParseContext {
  cards: Card[]
  history: Expense[]
  incomes?: Income[]
  baseCurrency: Currency
  today: DateKey
}

export const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()

// El orden importa: la primera categoría que coincide gana (p. ej. "Coffee Bar" es Comida, no Ocio).
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Súper: ['super', 'supermercado', 'automercado', 'walmart', 'pali', 'maxipali', 'masxmenos', 'pricesmart', 'megasuper', 'perimercados', 'fresh', 'mercado', 'market', 'feria', 'verduras', 'abarrotes', 'abastecedor', 'pulperia', 'mini super', 'minisuper', 'am pm'],
  Mascotas: ['pet shop', 'petshop', 'veterinaria', 'vete', 'mascota', 'agroveterinaria', 'pet'],
  Comida: ['restaurante', 'almuerzo', 'cena', 'desayuno', 'cafe', 'coffee', 'cafeteria', 'pizza', 'pizzeria', 'hamburguesa', 'sushi', 'mcdonalds', 'mc donalds', 'mcdonald', 'kfc', 'starbucks', 'comida', 'rappi', 'soda', 'pollo', 'pollos', 'rosti', 'tacos', 'taco', 'helado', 'panaderia', 'panad', 'pan', 'antojo', 'subway', 'burger', 'wendys', 'taco bell', 'pops', 'spoon', 'room service'],
  Transporte: ['gasolina', 'gasolinera', 'servicentro', 'unopetrol', 'uber', 'didi', 'taxi', 'bus', 'parqueo', 'parqueos', 'parking', 'peaje', 'global via', 'ruta 27', 'diesel', 'combustible', 'lavacar', 'mecanico', 'taller', 'llantas', 'marchamo', 'riteve', 'tren', 'repuestos'],
  Compras: ['amazon', 'ropa', 'zapatos', 'tenis', 'tienda', 'shein', 'temu', 'ebay', 'regalo', 'mall', 'zara', 'aliexpress', 'celular', 'audifonos', 'cargador', 'perfume', 'universal', 'monge', 'gollo', 'apple', 'pequeno mundo', 'pequeño mundo'],
  Salud: ['farmacia', 'medicina', 'medicamento', 'doctor', 'medico', 'dentista', 'clinica', 'hospital', 'examen', 'laboratorio', 'lentes', 'gimnasio', 'gym', 'fischel', 'sucre', 'terapia', 'consulta'],
  Hogar: ['luz', 'agua', 'electricidad', 'alquiler', 'renta', 'ferreteria', 'epa', 'novex', 'muebles', 'limpieza', 'gas', 'cable', 'kolbi', 'liberty', 'claro', 'telefono', 'recibo', 'casa', 'jardin', 'lavanderia'],
  Ocio: ['cine', 'netflix', 'spotify', 'juego', 'videojuego', 'playstation', 'xbox', 'steam', 'nintendo', 'concierto', 'bar', 'pub', 'licorera', 'cerveza', 'birras', 'fiesta', 'viaje', 'hotel', 'airbnb', 'entrada', 'teatro', 'disney', 'hbo', 'youtube', 'tragos', 'discoteca', 'play ground'],
}

const CASH_WORDS = ['efectivo', 'cash', 'debito', 'sinpe', 'transferencia', 'contado']
const CARD_CONNECTORS = new Set(['con', 'en', 'la', 'el', 'mi', 'tarjeta', 'de', 'por'])
const VERBS = new Set([
  'gaste', 'compre', 'pague', 'gastamos', 'compramos', 'pagamos', 'me', 'salio', 'costo', 'fue', 'fueron',
  'anota', 'anote', 'anotar', 'registra', 'registrar', 'agrega', 'agregar', 'pon', 'pone', 'apunta', 'gasto', 'compra', 'pago', 'son', 'eran',
])
// Verbos de ingreso: marcan la frase como ingreso y no forman parte de la descripción.
const INCOME_VERBS = new Set([
  'ingreso', 'ingresaron', 'ingresa', 'ingresan', 'entro', 'entraron', 'pagaron', 'recibi', 'recibimos', 'cobre', 'cobramos',
  'depositaron', 'cayo', 'cayeron', 'gane', 'ganamos', 'transfirieron', 'mandaron', 'hicieron', 'giraron',
])
// Sustantivos de ingreso: marcan la frase como ingreso pero sí sirven de descripción ("Salario").
const INCOME_NOUNS = new Set(['salario', 'sueldo', 'quincena', 'aguinaldo', 'bono', 'reembolso', 'comision', 'honorarios', 'venta', 'ventas', 'ganancia', 'dividendos', 'intereses'])
const EXPENSE_VERBS = new Set(['gaste', 'compre', 'pague', 'gastamos', 'compramos', 'pagamos', 'costo', 'salio'])
const INCOME_FILLER = new Set(['plata', 'dinero', 'cantidad', 'harina', 'un', 'una'])
// "mi empresa de Montevo" → "Montevo".
const INCOME_SOURCE_PREFIX = /^(empresa|trabajo|negocio|cliente|chamba|proyecto|compania|emprendimiento)\s+(de|del)\s+/i

const EDGE_STOPWORDS = new Set(['en', 'de', 'del', 'con', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'por', 'para', 'y', 'al', 'mi', 'a', 'que', 'tarjeta', 'o'])

const UNITS: Record<string, number> = {
  cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19,
  veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21, veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25,
  veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
  cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300, cuatrocientos: 400, cuatrocientas: 400,
  quinientos: 500, quinientas: 500, seiscientos: 600, seiscientas: 600, setecientos: 700, setecientas: 700,
  ochocientos: 800, ochocientas: 800, novecientos: 900, novecientas: 900,
}

interface Token {
  raw: string
  n: string
  used: boolean
}

function tokenize(text: string): Token[] {
  const spaced = text
    // "$20", "₡25000", "25mil", "20k" → tokens separados.
    .replace(/([$₡¢])/g, ' $1 ')
    .replace(/(\d)(mil|k|rojos?|tejas?)\b/gi, '$1 $2')
    .replace(/[¿?¡!;:"]/g, ' ')
  return spaced
    .split(/\s+/)
    .map((raw) => raw.replace(/^[,.]+|[,.]+$/g, ''))
    .filter(Boolean)
    .map((raw) => ({ raw, n: norm(raw), used: false }))
}

/** "25.000" / "25,000" / "12.50" / "12,5" → número. */
function parseNumeric(s: string): number | null {
  if (!/^\d[\d.,]*$/.test(s)) return null
  // Separadores de miles: grupos de 3 dígitos después de cada separador.
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) return Number(s.replace(/[.,]/g, ''))
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

interface AmountMatch {
  value: number
  currency?: Currency
}

/** Busca el monto en dígitos (con "mil", "k", "rojos"…) o, si no hay, en palabras. */
function findAmount(tokens: Token[]): AmountMatch | null {
  for (let i = 0; i < tokens.length; i++) {
    const base = parseNumeric(tokens[i].n)
    if (base === null) continue
    tokens[i].used = true
    let value = base
    let currency: Currency | undefined
    let j = i + 1
    const next = tokens[j]?.n
    if (next === 'mil' || next === 'k') {
      value *= 1000
      tokens[j++].used = true
      // "25 mil 500"
      const rest = tokens[j] ? parseNumeric(tokens[j].n) : null
      if (rest !== null && rest < 1000) {
        value += rest
        tokens[j++].used = true
      }
    } else if (next === 'millon' || next === 'millones') {
      value *= 1_000_000
      tokens[j++].used = true
    } else if (next === 'rojo' || next === 'rojos') {
      value *= 1000
      currency = 'CRC'
      tokens[j++].used = true
    } else if (next === 'teja' || next === 'tejas') {
      value *= 100
      currency = 'CRC'
      tokens[j++].used = true
    }
    return { value, currency }
  }
  return findWordAmount(tokens)
}

function findWordAmount(tokens: Token[]): AmountMatch | null {
  for (let i = 0; i < tokens.length; i++) {
    let total = 0
    let current = 0
    let j = i
    let words = 0
    let onlyArticle = true
    while (j < tokens.length) {
      const w = tokens[j].n
      if (w in UNITS) {
        current += UNITS[w]
        if (!['un', 'una', 'uno'].includes(w)) onlyArticle = false
      } else if (w === 'mil') {
        total += (current || 1) * 1000
        current = 0
        onlyArticle = false
      } else if (w === 'millon' || w === 'millones') {
        total += (current || 1) * 1_000_000
        current = 0
        onlyArticle = false
      } else if (w === 'y' && words > 0 && tokens[j + 1]?.n in UNITS) {
        // "treinta y cinco"
      } else break
      words++
      j++
    }
    const value = total + current
    // "una pizza" no es un monto.
    if (words > 0 && value > 0 && !onlyArticle) {
      for (let k = i; k < j; k++) tokens[k].used = true
      return { value }
    }
  }
  return null
}

function findCurrency(tokens: Token[]): Currency | null {
  for (const t of tokens) {
    if (['$', 'dolar', 'dolares', 'usd', 'dollar', 'dollars'].includes(t.n)) {
      t.used = true
      return 'USD'
    }
    if (['₡', '¢', 'colon', 'colones', 'crc', 'rojos', 'tejas'].includes(t.n)) {
      t.used = true
      return 'CRC'
    }
  }
  return null
}

/** Marca como usados los conectores justo antes de la palabra en i ("con la", "en mi tarjeta"). */
function consumeConnectors(tokens: Token[], i: number) {
  for (let k = i - 1; k >= 0 && k >= i - 3 && CARD_CONNECTORS.has(tokens[k].n); k--) tokens[k].used = true
}

function findCard(tokens: Token[], cards: Card[]): string | null | undefined {
  for (let i = 0; i < tokens.length; i++) {
    if (CASH_WORDS.includes(tokens[i].n)) {
      tokens[i].used = true
      consumeConnectors(tokens, i)
      return null
    }
  }
  let best: { id: string; score: number; idx: number[] } | null = null
  for (const card of cards) {
    // Por nombre del banco y por apodo ("con la del súper").
    const words = norm(`${card.name} ${card.nickname ?? ''}`).split(/\s+/).filter((w) => w.length >= 3)
    // También por banco y red elegidos en la tarjeta, aunque no estén en el nombre.
    if (card.bank === 'wink') words.push('wink', 'coopenae')
    if (card.bank === 'bac') words.push('bac', 'credomatic')
    if (card.network === 'visa') words.push('visa')
    if (card.network === 'mastercard') words.push('mastercard')
    const idx: number[] = []
    tokens.forEach((t, i) => {
      if (words.includes(t.n) || (card.lastFour && t.n === card.lastFour) || (t.n === 'master' && words.includes('mastercard'))) idx.push(i)
    })
    if (idx.length && (!best || idx.length > best.score)) best = { id: card.id, score: idx.length, idx }
  }
  if (!best) return undefined
  for (const i of best.idx) {
    tokens[i].used = true
    consumeConnectors(tokens, i)
  }
  return best.id
}

function findDate(tokens: Token[], today: DateKey): DateKey | null {
  const shift = (days: number) => {
    const [y, m, d] = today.split('-').map(Number)
    const dt = new Date(y, m - 1, d + days)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  }
  for (const t of tokens) {
    if (t.n === 'ayer') return (t.used = true), shift(-1)
    if (t.n === 'antier' || t.n === 'anteayer') return (t.used = true), shift(-2)
    if (t.n === 'hoy') return (t.used = true), today
  }
  return null
}

function categoryFromKeywords(text: string): string | null {
  const n = ` ${norm(text)} `
  for (const [cat, words] of Object.entries(CATEGORY_KEYWORDS)) {
    // Palabras largas también dentro de otras ("multimercado", "parqueos"); las cortas, solo enteras.
    if (words.some((w) => n.includes(` ${w} `) || n.includes(` ${w}s `) || (w.length >= 5 && n.includes(w)))) return cat
  }
  return null
}

/** El gasto anterior más reciente con la misma descripción (o que la contiene). */
function fromHistory(description: string, history: Expense[]): Expense | undefined {
  const d = norm(description)
  if (d.length < 3) return undefined
  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date))
  return sorted.find((e) => norm(e.description) === d) ?? sorted.find((e) => norm(e.description).includes(d) || d.includes(norm(e.description)))
}

/** Categoría y tipo sugeridos para una descripción (historial primero, después palabras clave). */
export function suggestFor(description: string, history: Expense[]): { category: string; scope?: ExpenseScope } {
  const past = fromHistory(description, history)
  return { category: past?.category ?? categoryFromKeywords(description) ?? 'Otros', scope: past?.scope ?? scopeFromKeywords(description) }
}

/** Tarjeta más usada en el historial (o la primera). */
export function suggestedCard(cards: Card[], history: Expense[]): string | null {
  if (cards.length === 0) return null
  const counts = new Map<string, number>()
  for (const e of history.slice(-50)) if (e.cardId) counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top && cards.some((c) => c.id === top[0]) ? top[0] : cards[0].id
}

// Comercios que por defecto son gastos en pareja (gasolina, peaje, súper grande, veterinaria).
// Una corrección del usuario queda en el historial y gana sobre esta lista.
const SCOPE_KEYWORDS: [ExpenseScope, string[]][] = [
  ['pareja', ['servicentro', 'unopetrol', 'gasolinera', 'gasolina', 'combustible', 'pricesmart', 'price smart', 'maxipali', 'maxi pali', 'ruta 27', 'global via', 'peaje', 'pet shop', 'petshop', 'veterinaria', 'vete']],
]

export function scopeFromKeywords(text: string): ExpenseScope | undefined {
  const n = ` ${norm(text)} `
  for (const [scope, words] of SCOPE_KEYWORDS) {
    if (words.some((w) => n.includes(` ${w} `) || (w.length >= 5 && n.includes(w)))) return scope
  }
  return undefined
}

// Frases de tipo de gasto; se quitan antes de leer la descripción.
const SCOPE_PATTERNS: [ExpenseScope, RegExp][] = [
  ['pareja', /\b(en pareja|a medias|compartido|entre los dos|juntos|con mi (pareja|novia|novio|esposa|esposo))\b/gi],
  ['casa', /\b((de|para) la casa|(del|para el) hogar|gasto de casa)\b/gi],
  ['personal', /\b(personal|solo mio|solo mío|para mi|para mí)\b/gi],
]

export function parseExpense(rawText: string, ctx: ParseContext): ParsedExpense {
  let text = rawText
  let spokenScope: ExpenseScope | undefined
  for (const [scope, re] of SCOPE_PATTERNS) {
    if (re.test(text)) {
      spokenScope ??= scope
      text = text.replace(re, ' ')
    }
    re.lastIndex = 0
  }
  const tokens = tokenize(text)
  const symbolCurrency = findCurrency(tokens)
  const amount = findAmount(tokens)
  const cardId = findCard(tokens, ctx.cards)
  const date = findDate(tokens, ctx.today) ?? ctx.today

  const isExpenseVerb = tokens.some((t) => EXPENSE_VERBS.has(t.n))
  const isIncome = !isExpenseVerb && tokens.some((t) => INCOME_VERBS.has(t.n) || INCOME_NOUNS.has(t.n))
  for (const t of tokens) {
    if (VERBS.has(t.n) || INCOME_VERBS.has(t.n) || (isIncome && INCOME_FILLER.has(t.n))) t.used = true
  }

  const rest = tokens.filter((t) => !t.used).map((t) => t.raw)
  while (rest.length && EDGE_STOPWORDS.has(norm(rest[0]))) rest.shift()
  while (rest.length && EDGE_STOPWORDS.has(norm(rest[rest.length - 1]))) rest.pop()
  let desc = rest.join(' ')
  if (isIncome) desc = desc.replace(INCOME_SOURCE_PREFIX, '')
  const description = desc ? desc[0].toUpperCase() + desc.slice(1) : ''
  const fortnight: 1 | 2 = Number(date.slice(8, 10)) <= 15 ? 1 : 2

  if (isIncome) {
    const d = norm(description)
    const past = d ? [...(ctx.incomes ?? [])].sort((a, b) => b.date.localeCompare(a.date)).find((i) => norm(i.description) === d) : undefined
    return {
      kind: 'income',
      description: past?.description ?? (description || 'Ingreso'),
      amount: amount ? Math.round(amount.value * 100) / 100 : null,
      currency: symbolCurrency ?? amount?.currency ?? past?.currency ?? ctx.baseCurrency,
      cardId: undefined,
      category: 'Ingreso',
      scope: 'personal',
      date,
      fortnight,
      found: { amount: !!amount, currency: !!symbolCurrency || !!amount?.currency, card: false, category: false, date: date !== ctx.today },
    }
  }

  const past = fromHistory(description, ctx.history)
  const keywordCategory = categoryFromKeywords(description) ?? categoryFromKeywords(text)
  const category = past?.category ?? keywordCategory ?? 'Otros'

  // Sin moneda dicha: la de la tarjeta si tiene una sola, si no la del historial o la principal.
  const resolvedCard = ctx.cards.find((c) => c.id === (cardId !== undefined ? cardId : past?.cardId))
  const cardCur = resolvedCard?.currency && resolvedCard.currency !== 'both' ? resolvedCard.currency : undefined
  let currency: Currency = symbolCurrency ?? amount?.currency ?? cardCur ?? past?.currency ?? ctx.baseCurrency
  // En Costa Rica nadie paga ₡25 por algo: un monto chico sin moneda casi seguro son dólares.
  if (!symbolCurrency && !amount?.currency && !cardCur && !past && ctx.baseCurrency === 'CRC' && amount && amount.value < 300) currency = 'USD'

  return {
    kind: 'expense',
    description: past && norm(past.description) === norm(description) ? past.description : description,
    amount: amount ? Math.round(amount.value * 100) / 100 : null,
    currency,
    cardId: cardId !== undefined ? cardId : past ? past.cardId : undefined,
    category,
    scope: spokenScope ?? past?.scope ?? scopeFromKeywords(description || text) ?? 'personal',
    date,
    fortnight,
    found: {
      amount: !!amount,
      currency: !!symbolCurrency || !!amount?.currency,
      card: cardId !== undefined,
      category: !!past || !!keywordCategory,
      date: date !== ctx.today,
    },
  }
}
