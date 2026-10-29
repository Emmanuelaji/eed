// All scheduling and display uses Africa/Lagos (UTC+1, no daylight saving) regardless of the browser's timezone.
export const TZ = 'Africa/Lagos'
const LAGOS_OFFSET = '+01:00'

const fmt = (opts) => new Intl.DateTimeFormat('en-NG', { timeZone: TZ, ...opts })

export const formatDateTime = (v) => (v ? fmt({ dateStyle: 'medium', timeStyle: 'short', hour12: true }).format(new Date(v)) : '—')
export const formatTime = (v) => (v ? fmt({ timeStyle: 'short', hour12: true }).format(new Date(v)) : '—')
export const formatTimeSeconds = (v) => (v ? fmt({ hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(v)) : '—')
export const formatDate = (v) => (v ? fmt({ dateStyle: 'medium' }).format(new Date(v)) : '—')

/** 'YYYY-MM-DD' for the given instant, as seen in Lagos. */
export function lagosDateString(v = new Date()) {
  const p = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(v))
  const g = (t) => p.find((x) => x.type === t).value
  return `${g('year')}-${g('month')}-${g('day')}`
}

/** 'HH:mm' for the given instant, as seen in Lagos. */
export function lagosTimeString(v = new Date()) {
  const p = fmt({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(v))
  const g = (t) => p.find((x) => x.type === t).value
  return `${g('hour')}:${g('minute')}`
}

/** Lagos wall-clock date ('YYYY-MM-DD') + time ('HH:mm') -> ISO instant (UTC). */
export function lagosToIso(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error('Invalid date or time')
  const d = new Date(`${date}T${time}:00${LAGOS_OFFSET}`)
  if (Number.isNaN(d.getTime())) throw new Error('Invalid date or time')
  return d.toISOString()
}

export const addMinutes = (iso, mins) => new Date(new Date(iso).getTime() + mins * 60000).toISOString()

/** value for <input type="datetime-local"> showing Lagos wall-clock time */
export const toLagosInput = (v) => (v ? `${lagosDateString(v)}T${lagosTimeString(v)}` : '')
export const fromLagosInput = (s) => lagosToIso(s.slice(0, 10), s.slice(11, 16))
