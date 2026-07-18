// api/send-email.js
// Vercel Serverless Function — deployed automatically at /api/send-email
// Runs server-side on Vercel so no CORS issues calling Resend API.

export default async function handler(req, res) {
  // CORS headers — allow requests from the same Vercel domain
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { apiKey, from, to, subject, html } = req.body ?? {}

  // Server-side validation — API key is never logged
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.startsWith('re_')) {
    return res.status(400).json({ error: 'Invalid Resend API key. It must start with "re_".' })
  }
  if (!from || typeof from !== 'string' || !from.includes('@')) {
    return res.status(400).json({ error: 'Invalid "from" email address.' })
  }
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    return res.status(400).json({ error: 'Invalid "to" email address.' })
  }
  if (!subject || !html) {
    return res.status(400).json({ error: 'Missing subject or html body.' })
  }

  try {
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ from, to: [to], subject, html }),
    })

    const data = await resendRes.json().catch(() => ({}))

    if (!resendRes.ok) {
      return res
        .status(resendRes.status)
        .json({ error: data.message ?? `Resend error (${resendRes.status})` })
    }

    return res.status(200).json({ success: true, id: data.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to reach Resend API'
    return res.status(502).json({ error: message })
  }
}
