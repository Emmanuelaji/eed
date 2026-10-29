import { AlertTriangle, Inbox, Loader2 } from 'lucide-react'
import Button from './Button'

export const Spinner = ({ label = 'Loading…' }) => (
  <div className="flex items-center justify-center gap-3 py-12 text-text-secondary" role="status" aria-live="polite">
    <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /><span className="text-sm">{label}</span>
  </div>
)
export const FullPageSpinner = () => <div className="flex min-h-screen items-center justify-center bg-background"><Spinner /></div>

export const EmptyState = ({ title = 'Nothing here yet', message, action }) => (
  <div className="flex flex-col items-center gap-2 py-12 text-center">
    <Inbox className="h-10 w-10 text-border" aria-hidden="true" />
    <p className="font-medium">{title}</p>
    {message && <p className="max-w-sm text-sm text-text-secondary">{message}</p>}
    {action}
  </div>
)

export const ErrorState = ({ message, onRetry }) => (
  <div className="flex flex-col items-center gap-3 py-12 text-center" role="alert">
    <AlertTriangle className="h-10 w-10 text-error" aria-hidden="true" />
    <p className="font-medium">Something went wrong</p>
    <p className="max-w-md text-sm text-text-secondary">{message}</p>
    {onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
  </div>
)

/** Renders loading / error / empty / content from a useQuery result so the four states are never confused. */
export function QueryBoundary({ query, isEmpty, empty, children }) {
  if (query.loading && !query.data) return <Spinner />
  if (query.error) return <ErrorState message={query.error} onRetry={query.reload} />
  if (query.data && isEmpty?.(query.data)) return empty ?? <EmptyState />
  return children(query.data)
}
