import { monthLabel, monthOf } from '../domain/dates'
import { cardSummaries, chargesForMonth, installmentIndex, monthBalance } from '../domain/finance'
import type { AppData, MonthKey } from '../domain/types'

const KIND_LABEL = { variable: 'Variable', fijo: 'Fijo', cuota: 'Tasa cero' } as const

/** Genera y descarga el reporte del mes. exceljs se carga solo al exportar. */
export async function exportMonthToExcel(data: AppData, month: MonthKey) {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Finanzas Personales'
  const s = data.settings
  const base = s.baseCurrency
  const charges = chargesForMonth(data, month)
  const bal = monthBalance(data, month, charges)
  const summaries = cardSummaries(data, month, charges)
  const cardName = (id: string | null) => data.cards.find((c) => c.id === id)?.name ?? 'Efectivo / débito'
  const money = (c: string) => (c === 'USD' ? '"$"#,##0.00' : '"₡"#,##0')

  const style = (ws: import('exceljs').Worksheet) => {
    const head = ws.getRow(1)
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111113' } }
    ws.views = [{ state: 'frozen', ySplit: 1 }]
  }

  // Resumen
  const r = wb.addWorksheet('Resumen')
  r.columns = [{ width: 32 }, { width: 20 }]
  r.addRow([`Reporte — ${monthLabel(month)}`]).font = { bold: true, size: 14 }
  r.addRow([`Moneda base: ${base} · Tipo de cambio: ₡${s.exchangeRate} por $1`])
  r.addRow([])
  const rows: [string, number][] = [
    ['Ingresos', bal.income],
    ['Gastos totales', bal.expenses],
    ['  Variables', bal.byKind.variable],
    ['  Fijos', bal.byKind.fijo],
    ['  Tasa cero', bal.byKind.cuota],
    ['Libre', bal.free],
    ['Presupuesto', bal.budget],
  ]
  for (const [label, v] of rows) {
    const row = r.addRow([label, v])
    row.getCell(2).numFmt = money(base)
  }
  r.addRow(['Uso del presupuesto', Number.isFinite(bal.usage) ? bal.usage : 0]).getCell(2).numFmt = '0.0%'

  // Pagos por tarjeta
  const p = wb.addWorksheet('Pagos por tarjeta')
  p.columns = [
    { header: 'Tarjeta', width: 24 },
    { header: 'Cobrado $', width: 14 },
    { header: 'Cobrado ₡', width: 16 },
    { header: 'Abonado $', width: 14 },
    { header: 'Abonado ₡', width: 16 },
    { header: 'Pendiente $', width: 14 },
    { header: 'Pendiente ₡', width: 16 },
    { header: `Pendiente total (${base})`, width: 22 },
  ]
  for (const sm of summaries) {
    const row = p.addRow([sm.card.name, sm.billed.USD, sm.billed.CRC, sm.paid.USD, sm.paid.CRC, sm.owed.USD, sm.owed.CRC, sm.owedBase])
    ;[2, 4, 6].forEach((i) => (row.getCell(i).numFmt = money('USD')))
    ;[3, 5, 7].forEach((i) => (row.getCell(i).numFmt = money('CRC')))
    row.getCell(8).numFmt = money(base)
  }
  style(p)

  // Detalle de cobros
  const d = wb.addWorksheet('Cobros del mes')
  d.columns = [
    { header: 'Tipo', width: 12 },
    { header: 'Descripción', width: 30 },
    { header: 'Tarjeta', width: 22 },
    { header: 'Fecha compra', width: 14 },
    { header: 'Detalle', width: 12 },
    { header: 'Categoría', width: 14 },
    { header: 'Moneda', width: 9 },
    { header: 'Monto', width: 16 },
  ]
  for (const c of charges) {
    const row = d.addRow([KIND_LABEL[c.kind], c.description, cardName(c.cardId), c.date ?? '', c.detail ?? '', c.category ?? '', c.currency, c.amount])
    row.getCell(8).numFmt = money(c.currency)
  }
  style(d)

  // Ingresos
  const inc = wb.addWorksheet('Ingresos')
  inc.columns = [
    { header: 'Fecha', width: 14 },
    { header: 'Quincena', width: 10 },
    { header: 'Descripción', width: 30 },
    { header: 'Moneda', width: 9 },
    { header: 'Monto', width: 16 },
  ]
  for (const i of data.incomes.filter((x) => monthOf(x.date) === month).sort((a, b) => a.date.localeCompare(b.date))) {
    inc.addRow([i.date, i.fortnight, i.description, i.currency, i.amount]).getCell(5).numFmt = money(i.currency)
  }
  style(inc)

  // Abonos
  const ab = wb.addWorksheet('Abonos')
  ab.columns = [
    { header: 'Fecha', width: 14 },
    { header: 'Tarjeta', width: 24 },
    { header: 'Moneda', width: 9 },
    { header: 'Monto', width: 16 },
  ]
  for (const a of data.payments.filter((x) => x.month === month)) {
    ab.addRow([a.date, cardName(a.cardId), a.currency, a.amount]).getCell(4).numFmt = money(a.currency)
  }
  style(ab)

  // Tasa cero
  const tc = wb.addWorksheet('Tasa cero')
  tc.columns = [
    { header: 'Producto', width: 28 },
    { header: 'Tarjeta', width: 22 },
    { header: 'Total', width: 16 },
    { header: 'Cuotas', width: 10 },
    { header: 'Cuota este mes', width: 14 },
    { header: 'Estado', width: 12 },
  ]
  for (const i of data.installments) {
    const idx = installmentIndex(i, month)
    if (idx < 0) continue
    const row = tc.addRow([i.description, cardName(i.cardId), i.total, i.months, `${idx + 1}/${i.months}`, i.paidMonths.includes(month) ? 'Pagada' : 'Pendiente'])
    row.getCell(3).numFmt = money(i.currency)
  }
  style(tc)

  const buf = await wb.xlsx.writeBuffer()
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `finanzas-${month}.xlsx`)
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
