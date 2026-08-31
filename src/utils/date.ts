/** Coerce SQLite/JSON timestamps (number, numeric string, or bigint) to epoch ms. */
export function toEpochMs(value: unknown): number {
  if (typeof value === 'bigint') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value)
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

/** Local calendar day as YYYY-MM-DD, matching <input type="date">. */
export function toLocalDateStr(value: unknown): string {
  const ms = toEpochMs(value)
  if (ms <= 0) return ''
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function todayLocalDateStr(): string {
  return toLocalDateStr(Date.now())
}
