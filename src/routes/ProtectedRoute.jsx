import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { FullPageSpinner } from '../components/ui/States'
import Button from '../components/ui/Button'

/** Usability guard only — the real security boundary is RLS and the database functions. */
export default function ProtectedRoute({ roles = [], children }) {
  const { user, profile, loading, profileError, hasRole, signOut, reloadProfile } = useAuth()
  const location = useLocation()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />
  if (!profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <h1 className="text-xl font-semibold">We could not load your account</h1>
        <p className="max-w-md text-sm text-text-secondary">{profileError || 'Your profile is missing.'}</p>
        <div className="flex gap-2"><Button onClick={reloadProfile}>Retry</Button><Button variant="outline" onClick={signOut}>Sign out</Button></div>
      </div>
    )
  }
  if (!profile.is_active) return <Navigate to="/unauthorized" replace state={{ reason: 'inactive' }} />
  if (roles.length && !hasRole(roles)) return <Navigate to="/unauthorized" replace />
  return children
}
