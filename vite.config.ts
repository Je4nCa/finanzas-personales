import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages sirve la app en /finanzas-personales/.
const base = process.env.GITHUB_ACTIONS ? '/finanzas-personales/' : '/'
// Versión visible en Ajustes: el commit publicado (o "dev" en local).
const appVersion = JSON.stringify((process.env.GITHUB_SHA ?? process.env.APP_VERSION ?? 'dev').slice(0, 7))

export default defineConfig(({ mode }) => {
  // Vista previa como artifact: rutas relativas, sin service worker y con datos de ejemplo.
  if (mode === 'artifact') {
    return {
      base: './',
      plugins: [react()],
      resolve: {
        alias: {
          'virtual:pwa-register': fileURLToPath(new URL('./src/pwa-stub.ts', import.meta.url)),
          exceljs: fileURLToPath(new URL('./src/exceljs-stub.ts', import.meta.url)),
        },
      },
      define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1'), __APP_VERSION__: appVersion },
      build: {
        outDir: 'dist-artifact',
        // Nombres estables: cada republicación del artifact reemplaza los mismos archivos.
        rolldownOptions: { output: { entryFileNames: 'assets/[name].js', chunkFileNames: 'assets/[name].js', assetFileNames: 'assets/[name][extname]' } },
      },
    }
  }
  return {
  base,
  define: { __APP_VERSION__: appVersion },
  build: { chunkSizeWarningLimit: 1000 },
  plugins: [
    react(),
    VitePWA({
      // La versión nueva espera hasta que el usuario toca "Actualizar" (ver src/pwa.ts).
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Finanzas Personales',
        short_name: 'Finanzas',
        description: 'Control de gastos por tarjeta y mes de pago',
        lang: 'es',
        theme_color: '#f4f4f6',
        background_color: '#f4f4f6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
}
})
