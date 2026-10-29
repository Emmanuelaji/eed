import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import Logo from '../../components/ui/Logo'
import { useAuth } from '../../context/AuthContext'
import { authService } from '../../services/authService'
import { friendlyError } from '../../lib/errors'
import { toast } from 'sonner'

export default function ResetPassword() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [pw, setPw] = useState(''); const [pw2, setPw2] = useState('')
  const [err, setErr] = useState(null); const [busy, setBusy] = useState(false)
  const submit = async (e) => {
    e.preventDefault(); setErr(null)
    if (pw.length < 8) return setErr('Use at least 8 characters.')
    if (pw !== pw2) return setErr('Passwords do not match.')
    setBusy(true)
    try { await authService.updatePassword(pw); toast.success('Password updated'); navigate('/', { replace: true }) }
    catch (e2) { setErr(friendlyError(e2)) } finally { setBusy(false) }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4"><Logo withText /></div>
        <h1 className="text-xl font-bold">Choose a new password</h1>
        {!loading && !user
          ? <p role="alert" className="mt-3 text-sm text-text-secondary">This reset link is invalid or has expired. <Link to="/forgot-password" className="text-primary underline">Request a new one</Link>.</p>
          : <form onSubmit={submit} className="mt-4 space-y-4">
              <Input label="New password" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
              <Input label="Confirm password" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} />
              {err && <p role="alert" className="text-sm text-error">{err}</p>}
              <Button type="submit" loading={busy} className="w-full">Update password</Button></form>}
      </Card>
    </div>
  )
}
