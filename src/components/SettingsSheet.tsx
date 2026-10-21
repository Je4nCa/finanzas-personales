import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { monthLabel, todayKey } from '../domain/dates'
import type { AppData } from '../domain/types'
import { download, exportMonthToExcel } from '../lib/excel'
import { selectData, useData, useUi } from '../store/store'
import { useOverlay } from '../store/ui'
import { Field, Segmented, Sheet } from './ui'

export function SettingsSheet() {
  const store = useData()
  const { settings, updateSettings, replaceAll } = store
  const month = useUi((s) => s.month)
  const { close, showToast } = useOverlay()
  const [rate, setRate] = useState(String(settings.exchangeRate))
  const [budget, setBudget] = useState(settings.monthlyBudget ? String(settings.monthlyBudget) : '')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportExcel = async () => {
    setBusy(true)
    try {
      await exportMonthToExcel(selectData(store), month)
      showToast('Reporte exportado')
    } catch (e) {
      console.error(e)
      showToast('No se pudo exportar')
    } finally {
      setBusy(false)
    }
  }

  const exportBackup = () => {
    const json = JSON.stringify({ app: 'finanzas-personales', version: 1, data: selectData(store) }, null, 2)
    download(new Blob([json], { type: 'application/json' }), `finanzas-respaldo-${todayKey()}.json`)
  }

  const importBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      const data: AppData | undefined = parsed?.data
      if (!data || !Array.isArray(data.cards) || !Array.isArray(data.expenses)) throw new Error('formato')
      if (!confirm('Esto reemplaza todos tus datos actuales por los del respaldo. ¿Continuar?')) return
      replaceAll(data)
      showToast('Respaldo restaurado')
      close()
    } catch {
      showToast('Archivo de respaldo inválido')
    }
  }

  return (
    <Sheet title="Ajustes" onClose={close}>
      <div className="form">
        <Field label="Tu nombre">
          <input className="input" value={settings.userName} onChange={(e) => updateSettings({ userName: e.target.value })} placeholder="Jean" />
        </Field>
        <Field label="Moneda principal (totales)">
          <Segmented
            value={settings.baseCurrency}
            onChange={(baseCurrency) => updateSettings({ baseCurrency })}
            options={[
              { value: 'CRC', label: 'Colones ₡' },
              { value: 'USD', label: 'Dólares $' },
            ]}
          />
        </Field>
        <Field label="Tipo de cambio (₡ por $1)">
          <input
            className="input num"
            inputMode="decimal"
            value={rate}
            onChange={(e) => {
              setRate(e.target.value)
              const n = parseFloat(e.target.value)
              if (n > 0) updateSettings({ exchangeRate: n })
            }}
          />
        </Field>
        <Field label={`Presupuesto mensual en ${settings.baseCurrency} (vacío = usar tus ingresos)`}>
          <input
            className="input num"
            inputMode="decimal"
            value={budget}
            placeholder="Usar ingresos del mes"
            onChange={(e) => {
              setBudget(e.target.value)
              const n = parseFloat(e.target.value)
              updateSettings({ monthlyBudget: n > 0 ? n : 0 })
            }}
          />
        </Field>

        <div className="section-title" style={{ margin: '10px 2px 0' }}>Datos</div>
        <button className="pill-btn glass block" onClick={exportExcel} disabled={busy}>
          <FileSpreadsheet /> {busy ? 'Generando…' : `Exportar Excel — ${monthLabel(month)}`}
        </button>
        <div className="grid-2">
          <button className="pill-btn glass block" onClick={exportBackup}>
            <Download /> Respaldo
          </button>
          <button className="pill-btn glass block" onClick={() => fileRef.current?.click()}>
            <Upload /> Restaurar
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) importBackup(f)
            e.target.value = ''
          }}
        />
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '4px 4px 0', lineHeight: 1.5 }}>
          Tus datos se guardan solo en este teléfono. Descargá un respaldo de vez en cuando para no perderlos si borrás el navegador o cambiás de equipo.
        </p>
      </div>
    </Sheet>
  )
}
