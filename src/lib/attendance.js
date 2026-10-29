// Client-side mirrors of the database rules. The DATABASE is authoritative; these are used for UI hints and tests.

export const SESSION_STATUS = ['SCHEDULED', 'OPEN', 'AUTO_CLOSED', 'REOPENED', 'CLOSED', 'CANCELLED']

/** Is the class accepting scans at `now`? (mirrors _apply_attendance) */
export function isAccepting(session, now = new Date()) {
  const t = new Date(now).getTime()
  const deadline = new Date(session.auto_close_at).getTime()
  if (t >= deadline) return false
  if (session.status === 'OPEN' || session.status === 'REOPENED') return true
  if (session.status === 'SCHEDULED' && session.early_signin_minutes > 0) {
    return t >= new Date(session.scheduled_start).getTime() - session.early_signin_minutes * 60000
  }
  return false
}

/** Status the database would show once reconcile_sessions() runs. */
export function effectiveStatus(session, now = new Date()) {
  if ((session.status === 'OPEN' || session.status === 'REOPENED') && new Date(now) >= new Date(session.auto_close_at)) return 'AUTO_CLOSED'
  return session.status
}

/** Where is "now" relative to the three separate times? Scheduled end, auto-close deadline and manual closure are distinct. */
export function sessionPhase(session, now = new Date()) {
  const t = new Date(now).getTime()
  const status = effectiveStatus(session, now)
  if (['CLOSED', 'CANCELLED', 'AUTO_CLOSED'].includes(status)) return status
  if (status === 'SCHEDULED') return t < new Date(session.scheduled_start).getTime() ? 'WAITING_TO_START' : 'START_DUE'
  if (t < new Date(session.scheduled_end).getTime()) return 'IN_PROGRESS'
  return 'GRACE_PERIOD' // scheduled end has passed, deadline has not
}

export function attendanceStatus(signInAt, scheduledStart, lateAfterMinutes) {
  return new Date(signInAt).getTime() > new Date(scheduledStart).getTime() + lateAfterMinutes * 60000 ? 'LATE' : 'PRESENT'
}

export function durationMinutes(signInAt, signOutAt) {
  return Math.floor((new Date(signOutAt).getTime() - new Date(signInAt).getTime()) / 60000)
}

export const formatDuration = (mins) => {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60)
  return h ? `${h}h ${mins % 60}m` : `${mins}m`
}
