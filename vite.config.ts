import { defineConfig, type Plugin } from 'vitest/config'
import type { OutgoingHttpHeaders } from 'node:http'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string }

// ---------------------------------------------------------------------------
// Email API Plugin
// Adds a POST /api/send-email endpoint directly inside the Vite dev server.
// This avoids CORS entirely — the call to Resend happens from Node.js,
// not from the browser. No separate Express server needed.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// COOP / COEP Header Plugin
// Required for @sqlite.org/sqlite-wasm with opfs-sahpool VFS.
// SharedArrayBuffer (needed by WASM threads) is only available when the page
// is cross-origin isolated.
// ---------------------------------------------------------------------------
function coopCoepPlugin(): Plugin {
  const HEADERS: OutgoingHttpHeaders = {
    'Cross-Origin-Opener-Policy':  'same-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
  }
  return {
    name: 'coop-coep',
    configureServer(server) {
      server.middlewares.use((_req, res, next) => {
        Object.entries(HEADERS).forEach(([k, v]) => res.setHeader(k, v as string))
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((_req, res, next) => {
        Object.entries(HEADERS).forEach(([k, v]) => res.setHeader(k, v as string))
        next()
      })
    },
  }
}

function emailApiPlugin(): Plugin {
  return {
    name: 'email-api',
    configureServer(server) {
      server.middlewares.use(
        '/api/send-email',
        async (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')

          if (req.method !== 'POST') {
            res.writeHead(405).end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }

          // Read request body
          const chunks: Buffer[] = []
          for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
          }

          let body: { apiKey?: string; from?: string; to?: string; subject?: string; html?: string }
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf-8')) as typeof body
          } catch {
            res.writeHead(400).end(JSON.stringify({ error: 'Invalid JSON body' }))
            return
          }

          const { apiKey, from, to, subject, html } = body

          // Validate fields
          if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('re_')) {
            res.writeHead(400).end(JSON.stringify({ error: 'Invalid Resend API key. It must start with "re_".' }))
            return
          }
          if (!from || !from.includes('@')) {
            res.writeHead(400).end(JSON.stringify({ error: 'Invalid "from" email.' }))
            return
          }
          if (!to || !to.includes('@')) {
            res.writeHead(400).end(JSON.stringify({ error: 'Invalid "to" email.' }))
            return
          }
          if (!subject || !html) {
            res.writeHead(400).end(JSON.stringify({ error: 'Missing subject or html.' }))
            return
          }

          // Call Resend from Node.js — no CORS restriction
          try {
            const resendRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({ from, to: [to], subject, html }),
            })

            const data = (await resendRes.json().catch(() => ({}))) as {
              id?: string
              message?: string
              name?: string
            }

            if (!resendRes.ok) {
              res
                .writeHead(resendRes.status)
                .end(JSON.stringify({ error: data.message ?? `Resend error (${resendRes.status})` }))
              return
            }

            res.writeHead(200).end(JSON.stringify({ success: true, id: data.id }))
          } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to reach Resend API'
            res.writeHead(502).end(JSON.stringify({ error: message }))
          }
        },
      )
    },
  }
}

export default defineConfig({
  plugins: [
    coopCoepPlugin(),
    emailApiPlugin(),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'pwa-512x512.svg'],
      manifest: {
        name: 'Quick Sale POS - Point of Sale & Billing',
        short_name: 'QuickSale',
        description: 'Fast, modern Point of Sale billing application with offline support and cloud sync',
        theme_color: '#4F46E5',
        background_color: '#0F172A',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['business', 'finance', 'productivity', 'utilities'],
        icons: [
          {
            src: '/favicon.svg',
            sizes: '48x48 72x72 96x96 128x128 192x192 256x256',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/pwa-512x512.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
        shortcuts: [
          {
            name: 'New Sale',
            short_name: 'Sale',
            description: 'Start a new sale',
            url: '/',
            icons: [{ src: '/favicon.svg', sizes: '96x96' }],
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  optimizeDeps: {
    // @sqlite.org/sqlite-wasm ships its own WASM loader — exclude from Vite
    // bundling so the WASM file is served as-is.
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
  server: {
    allowedHosts: true,
  },
})
