import type { CompletedSale, EmailSettings } from '../../types'

const RESEND_API_URL = 'https://api.resend.com/emails'

export interface EmailResult {
  success: boolean
  error?: string
}

function formatAmount(paise: number): string {
  return `₹${(paise / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function buildInvoiceHtml(sale: CompletedSale, businessName: string): string {
  const paymentLabels: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
  }

  const itemRows = sale.items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;">${escHtml(item.name)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">${formatAmount(item.unitPricePaise)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;">${formatAmount(item.unitPricePaise * item.quantity)}</td>
      </tr>`,
    )
    .join('')

  const discountRow =
    sale.discountPaise > 0
      ? `<tr>
           <td colspan="3" style="padding:6px 12px;text-align:right;color:#ef4444;">Discount</td>
           <td style="padding:6px 12px;text-align:right;color:#ef4444;">-${formatAmount(sale.discountPaise)}</td>
         </tr>`
      : ''

  const customerSection = sale.customer
    ? `<div style="margin-bottom:20px;padding:14px;background:#f8fafc;border-radius:8px;">
         <strong style="color:#374151;">Customer</strong><br/>
         <span style="color:#6b7280;">${escHtml(sale.customer.name)} · ${escHtml(sale.customer.phone)}${sale.customer.email ? ` · ${escHtml(sale.customer.email)}` : ''}</span>
       </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escHtml(businessName)}</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Invoice ${escHtml(sale.invoiceNumber)}</p>
          </td>
        </tr>
        <!-- Meta -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#6b7280;font-size:13px;">Date</td>
                <td style="color:#6b7280;font-size:13px;text-align:right;">Payment</td>
              </tr>
              <tr>
                <td style="color:#111827;font-size:15px;font-weight:600;">${formatDate(sale.completedAt)}</td>
                <td style="color:#111827;font-size:15px;font-weight:600;text-align:right;">${paymentLabels[sale.paymentMethod] ?? sale.paymentMethod}</td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Customer -->
        <tr><td style="padding:20px 32px 0;">${customerSection}</td></tr>
        <!-- Items -->
        <tr>
          <td style="padding:20px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Item</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Qty</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Price</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
              <tfoot>
                ${discountRow}
                <tr style="background:#f8fafc;">
                  <td colspan="3" style="padding:12px 12px;text-align:right;font-weight:700;font-size:16px;color:#111827;">Total</td>
                  <td style="padding:12px 12px;text-align:right;font-weight:700;font-size:16px;color:#6366f1;">${formatAmount(sale.grandTotalPaise)}</td>
                </tr>
              </tfoot>
            </table>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:24px 32px;text-align:center;color:#9ca3af;font-size:12px;">
            Thank you for your business!<br/>
            Sent via Quick Sale POS
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildDailyDigestHtml(sales: CompletedSale[], businessName: string, date: string): string {
  const totalRevenue = sales.reduce((sum, s) => sum + s.grandTotalPaise, 0)
  const paymentBreakdown = sales.reduce(
    (acc, s) => {
      acc[s.paymentMethod] = (acc[s.paymentMethod] ?? 0) + s.grandTotalPaise
      return acc
    },
    {} as Record<string, number>,
  )
  const paymentLabels: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card' }

  const invoiceRows = sales
    .map(
      (s) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#374151;">${escHtml(s.invoiceNumber)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#6b7280;font-size:13px;">${new Date(s.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;color:#6b7280;">${s.customer ? escHtml(s.customer.name) : '—'}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;font-weight:600;color:#111827;">${formatAmount(s.grandTotalPaise)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;"><span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:99px;font-size:12px;">${paymentLabels[s.paymentMethod] ?? s.paymentMethod}</span></td>
    </tr>`,
    )
    .join('')

  const breakdownRows = Object.entries(paymentBreakdown)
    .map(
      ([method, paise]) =>
        `<tr>
          <td style="padding:8px 0;color:#6b7280;">${paymentLabels[method] ?? method}</td>
          <td style="padding:8px 0;text-align:right;font-weight:600;color:#111827;">${formatAmount(paise)}</td>
        </tr>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fb;padding:32px 0;">
    <tr><td align="center">
      <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:28px 32px;">
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${escHtml(businessName)}</h1>
            <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Daily Sales Digest — ${date}</p>
          </td>
        </tr>
        <!-- Stats -->
        <tr>
          <td style="padding:24px 32px 0;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px;width:33%;">
                  <div style="font-size:28px;font-weight:700;color:#6366f1;">${sales.length}</div>
                  <div style="color:#6b7280;font-size:13px;margin-top:4px;">Invoices</div>
                </td>
                <td width="16"></td>
                <td style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px;width:33%;">
                  <div style="font-size:28px;font-weight:700;color:#6366f1;">${formatAmount(totalRevenue)}</div>
                  <div style="color:#6b7280;font-size:13px;margin-top:4px;">Total Revenue</div>
                </td>
                <td width="16"></td>
                <td style="text-align:center;padding:16px;background:#f8fafc;border-radius:12px;width:33%;">
                  <div style="font-size:28px;font-weight:700;color:#6366f1;">${formatAmount(Math.round(totalRevenue / Math.max(1, sales.length)))}</div>
                  <div style="color:#6b7280;font-size:13px;margin-top:4px;">Avg. Invoice</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <!-- Payment breakdown -->
        <tr>
          <td style="padding:20px 32px 0;">
            <strong style="color:#374151;font-size:14px;">Payment Breakdown</strong>
            <table width="200" cellpadding="0" cellspacing="0" style="margin-top:8px;">${breakdownRows}</table>
          </td>
        </tr>
        <!-- Invoices table -->
        <tr>
          <td style="padding:20px 32px 0;">
            <strong style="color:#374151;font-size:14px;">All Invoices</strong>
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-collapse:collapse;">
              <thead>
                <tr style="background:#f8fafc;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Invoice</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Time</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;">Customer</th>
                  <th style="padding:10px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;">Total</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;">Payment</th>
                </tr>
              </thead>
              <tbody>${invoiceRows}</tbody>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:24px 32px;text-align:center;color:#9ca3af;font-size:12px;">
            Automated daily digest from Quick Sale POS
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function validateSettings(settings: EmailSettings): string | null {
  if (!settings.resendApiKey || !settings.resendApiKey.startsWith('re_')) {
    return 'Invalid Resend API key. It should start with "re_".'
  }
  if (!settings.fromEmail || !settings.fromEmail.includes('@')) {
    return 'Invalid "From" email address.'
  }
  if (!settings.toEmail || !settings.toEmail.includes('@')) {
    return 'Invalid "To" email address.'
  }
  return null
}

async function sendViaResend(
  apiKey: string,
  payload: {
    from: string
    to: string[]
    subject: string
    html: string
  },
): Promise<EmailResult> {
  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string }
      return {
        success: false,
        error: body.message ?? `Resend API error (${response.status})`,
      }
    }

    return { success: true }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error sending email',
    }
  }
}

export async function sendInvoiceEmail(
  sale: CompletedSale,
  settings: EmailSettings,
  businessName: string,
): Promise<EmailResult> {
  const validationError = validateSettings(settings)
  if (validationError) return { success: false, error: validationError }

  const html = buildInvoiceHtml(sale, businessName)
  const subject = `Invoice ${sale.invoiceNumber} — ${businessName}`

  return sendViaResend(settings.resendApiKey, {
    from: settings.fromEmail,
    to: [settings.toEmail],
    subject,
    html,
  })
}

export async function sendDailyDigestEmail(
  sales: CompletedSale[],
  settings: EmailSettings,
  businessName: string,
): Promise<EmailResult> {
  const validationError = validateSettings(settings)
  if (validationError) return { success: false, error: validationError }

  if (sales.length === 0) {
    return { success: false, error: 'No sales for today to include in digest.' }
  }

  const dateStr = new Date().toLocaleDateString('en-IN', { dateStyle: 'long' })
  const html = buildDailyDigestHtml(sales, businessName, dateStr)
  const subject = `Daily Sales Digest — ${dateStr} — ${businessName}`

  return sendViaResend(settings.resendApiKey, {
    from: settings.fromEmail,
    to: [settings.toEmail],
    subject,
    html,
  })
}

export async function sendTestEmail(
  settings: EmailSettings,
  businessName: string,
): Promise<EmailResult> {
  const validationError = validateSettings(settings)
  if (validationError) return { success: false, error: validationError }

  return sendViaResend(settings.resendApiKey, {
    from: settings.fromEmail,
    to: [settings.toEmail],
    subject: `✅ Test Email — ${businessName}`,
    html: `<p style="font-family:sans-serif;padding:24px;">
      <strong>Email integration is working!</strong><br/><br/>
      Your Quick Sale POS is connected to Resend and will send invoices to <strong>${escHtml(settings.toEmail)}</strong>.
    </p>`,
  })
}
