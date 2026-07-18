/**
 * Daily Digest Scheduler
 *
 * Schedules a daily email at 22:00 (10 PM) local time containing all
 * sales from that calendar day. Uses localStorage to prevent double-sends
 * if the page is refreshed after the digest has already been sent.
 *
 * Security: API key is always read fresh from the DB at send time,
 * never cached in module scope.
 */

import { getSettings } from '../db/database'
import { getSalesByDateRange } from '../db/database'
import { sendDailyDigestEmail } from './emailService'

const LAST_SENT_KEY = 'quick-sale-pos:digest-last-sent'
let schedulerTimer: ReturnType<typeof setTimeout> | null = null

function getTodayBounds(): { start: number; end: number } {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  return { start: start.getTime(), end: end.getTime() }
}

function getMsUntilNextTenPM(): number {
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 22, 0, 0, 0)
  if (target.getTime() <= now.getTime()) {
    // Already past 10 PM today — schedule for tomorrow
    target.setDate(target.getDate() + 1)
  }
  return target.getTime() - now.getTime()
}

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function wasDigestAlreadySentToday(): boolean {
  try {
    const stored = localStorage.getItem(LAST_SENT_KEY)
    return stored === todayKey()
  } catch {
    return false
  }
}

function markDigestSentToday(): void {
  try {
    localStorage.setItem(LAST_SENT_KEY, todayKey())
  } catch {
    // non-critical
  }
}

async function runDailyDigest(): Promise<void> {
  if (wasDigestAlreadySentToday()) {
    scheduleNextDigest()
    return
  }

  try {
    const settings = await getSettings()
    if (!settings.emailSettings?.resendApiKey) {
      scheduleNextDigest()
      return
    }

    const { start, end } = getTodayBounds()
    const sales = await getSalesByDateRange(start, end)

    if (sales.length === 0) {
      scheduleNextDigest()
      return
    }

    const result = await sendDailyDigestEmail(
      sales,
      settings.emailSettings,
      settings.businessName,
    )

    if (result.success) {
      markDigestSentToday()
    }
  } catch {
    // Scheduler errors are silent — we don't want to crash the app
  } finally {
    scheduleNextDigest()
  }
}

function scheduleNextDigest(): void {
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer)
  }
  const msUntil = getMsUntilNextTenPM()
  schedulerTimer = setTimeout(() => {
    void runDailyDigest()
  }, msUntil)
}

/**
 * Start the daily digest scheduler. Call once from main.tsx on app boot.
 * Safe to call multiple times — only one timer will run at a time.
 */
export function startDailyDigestScheduler(): void {
  scheduleNextDigest()
}

/**
 * Manually trigger today's digest (used by the "Send Report Now" button).
 * Bypasses the already-sent check.
 */
export async function triggerDailyDigestNow(): Promise<{ success: boolean; error?: string }> {
  try {
    const settings = await getSettings()
    if (!settings.emailSettings?.resendApiKey) {
      return { success: false, error: 'Email not configured. Add your Resend API key in App Settings.' }
    }

    const { start, end } = getTodayBounds()
    const sales = await getSalesByDateRange(start, end)

    if (sales.length === 0) {
      return { success: false, error: 'No sales recorded today.' }
    }

    const result = await sendDailyDigestEmail(
      sales,
      settings.emailSettings,
      settings.businessName,
    )

    if (result.success) {
      markDigestSentToday()
    }

    return result
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
  }
}
