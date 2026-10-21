// Convierte dist-artifact/index.html al formato de artifact: sin doctype/html/head/body (el visor los agrega).
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'dist-artifact/index.html'
const html = readFileSync(file, 'utf8')
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
const body = html.match(/<body>([\s\S]*)<\/body>/)[1]
const keep = head
  .split('\n')
  .filter((l) => !/<meta charset|name="viewport"|rel="icon"|apple-touch-icon|apple-mobile/.test(l))
  .join('\n')
writeFileSync(file, `${keep.trim()}\n${body.trim()}\n`)
