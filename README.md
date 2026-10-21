# Finanzas Personales

PWA móvil para controlar gastos por tarjeta y **mes de pago** (no por fecha de compra). React + TypeScript + Vite. Los datos se guardan solo en el teléfono (IndexedDB).

## Comandos

```bash
npm install
npm run dev      # servidor de desarrollo (también accesible desde el teléfono en la red local)
npm test         # tests de la lógica de ciclos y saldos
npm run build    # build de producción en dist/
npm run build:artifact  # vista previa para artifact de Claude (rutas relativas, sin service worker, datos de ejemplo)
```

## Estructura

- `src/domain/` — tipos y lógica pura: `paymentMonthFor` (en qué mes se cobra una compra según cierre/pago), cobros del mes, saldos por tarjeta, balance.
- `src/store/` — estado con zustand persistido en IndexedDB; estado de UI (mes seleccionado, sheets).
- `src/screens/` — Inicio, Registro (gastos / fijos / ingresos), Pagos, Tasa cero, Tarjetas.
- `src/components/` — UI base (estilo liquid glass), formularios y Ajustes.
- `src/domain/parseExpense.ts` — interpreta gastos dictados ("25 mil en el súper con la BAC"): monto, moneda, tarjeta, categoría, fecha; aprende del historial.
- `src/components/logos.tsx` — logos de Visa, Mastercard y comercios (Simple Icons, CC0); logos de BAC y Wink en `src/assets/logos/` (provistos por el usuario).
- `src/lib/excel.ts` — reporte mensual en Excel (exceljs se carga solo al exportar).
- `design-references/` — imágenes de referencia del diseño.

## Reglas del dominio

- Compra con tarjeta: entra al estado que cierra en el próximo día de cierre (inclusive) y se paga en el siguiente día de pago. Un día 31 en un mes corto se toma como el último día.
- Efectivo / débito: cuenta en el mes de la compra.
- Saldos en USD y CRC se llevan por separado (tarjetas bimoneda); cada abono descuenta su moneda. Los totales se convierten a la moneda principal con el tipo de cambio de Ajustes.
- Presupuesto: el configurado en Ajustes, o si está vacío, los ingresos del mes.

## Atajo de iOS

Abrir la app con `?gasto=<texto>` abre el gasto rápido ya interpretado. Un Atajo de iOS con "Dictar texto" → "Abrir URL" (`https://je4nca.github.io/finanzas-personales/?gasto=` + texto dictado) permite registrar gastos con Siri.
