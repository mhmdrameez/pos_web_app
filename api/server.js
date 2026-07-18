// api/server.js
// Local Express API server — runs alongside Vite dev server
// Handles Resend email API calls server-side to avoid browser CORS restrictions.
// Port: 3001 (Vite proxies /api/* → http://localhost:3001)

import express from 'express'
import cors from 'cors'

const app = express()
const PORT = 3001

app.use(express.json({ limit: '2mb' }))
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173','https://posquickbill.vercel.app'] }))

const RESEND_API_URL = 'https://api.resend.com/emails'

/**
 * POST /api/send-email
 * Body: { apiKey, from, to, subject, html }
 * Proxies the request to Resend from Node.js (no CORS issue server-side).
 */
app.post('/api/send-email', async (req, res) => {
  const { apiKey, from, to, subject, html } = req.body

  // Basic validation — never log the API key
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('re_')) {
    return res.status(400).json({ error: 'Invalid or missing Resend API key.' })
  }
  if (!from || !to || !subject || !html) {
    return res.status(400).json({ error: 'Missing required fields: from, to, subject, html.' })
  }
  if (typeof to !== 'string' || !to.includes('@')) {
    return res.status(400).json({ error: 'Invalid "to" email address.' })
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message ?? `Resend error (${response.status})`,
      })
    }

    return res.json({ success: true, id: data.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error contacting Resend'
    return res.status(502).json({ error: message })
  }
})

app.listen(PORT, () => {
  console.log(`[API] Email proxy server running at http://localhost:${PORT}`)
})
