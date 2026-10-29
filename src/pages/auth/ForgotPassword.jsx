import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { Card } from '../../components/ui/Card'
import Logo from '../../components/ui/Logo'
import { authService } from '../../services/authService'
import { friendlyError } from '../../lib/errors'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState({ busy: false, sent: false, error: null })
  const submit = async (e) => {
    e.preventDefault(); setState({ busy: true, sent: false, error: null })
    try { await authService.requestPasswordReset(email.trim()); setState({ busy: false, sent: true, error: null }) }
    catch (err) { setState({ busy: false, sent: false, error: friendlyError(err) }) }
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <div className="mb-4"><Logo withText /></div>
        <h1 className="text-xl font-bold">Reset your password</h1>
        {state.sent
          ? <p className="mt-3 text-sm text-text-secondary" role="status">If an account exists for that email, a reset link has been sent. Check your inbox.</p>
          : <form onSubmit={submit} className="mt-4 space-y-4"><Input label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              {state.error && <p role="alert" className="text-sm text-error">{state.error}</p>}
              <Button type="submit" loading={state.busy} className="w-full">Send reset link</Button></form>}
        <Link to="/login" className="mt-4 block text-center text-sm text-primary hover:underline">Back to sign in</Link>
      </Card>
    </div>
  )
}
