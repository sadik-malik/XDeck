import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

// Dev only. Vite's HMR client and @vitejs/plugin-react's refresh preamble need an inline script,
// inline styles and a websocket. The production index.html keeps the strict policy untouched.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

const CSP_META = /(<meta\s+http-equiv="Content-Security-Policy"\s+content=")[^"]*(")/

function devCsp(): Plugin {
  return {
    name: 'xdeck-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      if (!CSP_META.test(html)) {
        throw new Error('xdeck-dev-csp: Content-Security-Policy meta tag not found in index.html')
      }
      return html.replace(
        CSP_META,
        (_match, open: string, close: string) => `${open}${DEV_CSP}${close}`,
      )
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      // Two sandboxed preloads: the shell (out/preload/index.js) and the column guest
      // (out/preload/column-preload.js), which will-attach-webview forces onto every <webview>.
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          'column-preload': resolve('src/column-preload/index.ts'),
        },
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss(), devCsp()],
  },
})
