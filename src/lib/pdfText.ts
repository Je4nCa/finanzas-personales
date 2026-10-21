/** Una celda de texto con su posición horizontal (en puntos PDF). */
export interface Cell {
  str: string
  x: number
}

export type Line = Cell[]

interface TextItemLike {
  str: string
  transform: number[]
  width: number
}

interface PdfLib {
  getDocument: (src: { data: Uint8Array }) => { promise: Promise<PdfDocLike> }
}
interface PdfDocLike {
  numPages: number
  getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }>
}

/**
 * Convierte el PDF en líneas de celdas, de arriba hacia abajo y de izquierda a derecha.
 * Los fragmentos casi pegados se unen en una sola celda (pdf.js a veces parte palabras).
 */
export async function extractLines(pdfjs: PdfLib, data: ArrayBuffer): Promise<Line[]> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise
  const lines: Line[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const { items } = await page.getTextContent()
    const rows: { y: number; items: (TextItemLike & { x: number })[] }[] = []
    for (const raw of items as TextItemLike[]) {
      if (!('str' in raw) || !raw.str.trim()) continue
      const x = raw.transform[4]
      const y = raw.transform[5]
      const row = rows.find((r) => Math.abs(r.y - y) < 2.5)
      if (row) row.items.push({ ...raw, x })
      else rows.push({ y, items: [{ ...raw, x }] })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const row of rows) {
      row.items.sort((a, b) => a.x - b.x)
      const cells: Line = []
      let prevEnd = -Infinity
      for (const it of row.items) {
        const last = cells[cells.length - 1]
        const gap = it.x - prevEnd
        if (last && gap < 1.5) last.str += it.str
        else if (last && gap < 3.5) last.str += ` ${it.str}`
        else cells.push({ str: it.str.trim(), x: Math.round(it.x) })
        prevEnd = it.x + it.width
      }
      for (const c of cells) c.str = c.str.replace(/\s+/g, ' ').trim()
      lines.push(cells.filter((c) => c.str))
    }
  }
  return lines
}
