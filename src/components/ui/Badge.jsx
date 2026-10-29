import { clsx } from 'clsx'

const variants = { success: 'badge-success', warning: 'badge-warning', error: 'badge-error', info: 'badge-info', neutral: 'badge-neutral' }
export default function Badge({ children, variant = 'neutral', className }) {
  return <span className={clsx(variants[variant], className)}>{children}</span>
}

const MAP = {
  SCHEDULED: ['info', 'Scheduled'], OPEN: ['success', 'Open'], AUTO_CLOSED: ['warning', 'Auto-closed'], REOPENED: ['success', 'Reopened'],
  CLOSED: ['neutral', 'Closed'], CANCELLED: ['error', 'Cancelled'],
  PRESENT: ['success', 'Present'], LATE: ['warning', 'Late'], ABSENT: ['error', 'Absent'], PENDING: ['neutral', 'Pending'],
  ENROLLED: ['success', 'Enrolled'], NOT_ENROLLED: ['neutral', 'Not enrolled'], REVOKED: ['error', 'Revoked'],
  REGISTERED: ['info', 'Registered'], ACTIVE: ['success', 'Active'], SUSPENDED: ['error', 'Suspended'], GRADUATED: ['neutral', 'Graduated'], WITHDRAWN: ['neutral', 'Withdrawn'],
  FINGERPRINT: ['success', 'Fingerprint'], ADMIN_OVERRIDE: ['warning', 'Override'],
  ADMIN: ['info', 'Admin'], LECTURER: ['success', 'Lecturer'], STUDENT: ['neutral', 'Student'],
}
export const StatusBadge = ({ status }) => {
  const [variant, label] = MAP[status] || ['neutral', status || '—']
  return <Badge variant={variant}>{label}</Badge>
}
