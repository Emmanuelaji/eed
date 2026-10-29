import { Link, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth, homeForRole } from '../../context/AuthContext'
import Button from '../../components/ui/Button'

export default function Unauthorized() {
  const { profile, signOut } = useAuth()
  const inactive = useLocation().state?.reason === 'inactive'
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <ShieldAlert className="h-14 w-14 text-warning" aria-hidden="true" />
      <h1 className="text-2xl font-bold">{inactive ? 'Account deactivated' : 'Access denied'}</h1>
      <p className="max-w-md text-text-secondary">{inactive ? 'Your account has been deactivated. Contact an administrator.' : 'You do not have permission to view that page.'}</p>
      <div className="flex gap-2">
        {profile?.is_active && <Link to={homeForRole(profile.role)} className="btn-primary btn-md">Go to my dashboard</Link>}
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    </div>
  )
}
