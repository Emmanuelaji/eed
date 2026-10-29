import { Link, Navigate, useLocation } from 'react-router-dom'
import { CheckCircle2, Printer } from 'lucide-react'
import { Card } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Logo from '../../components/ui/Logo'

export default function RegistrationSuccess() {
  const { state } = useLocation()
  if (!state?.reference) return <Navigate to="/" replace />
  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex justify-center"><Logo withText /></div>
        <Card className="text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-success" aria-hidden="true" />
          <h1 className="mt-3 text-2xl font-bold">{state.already ? 'You are already registered' : 'Registration successful'}</h1>
          {state.course && <p className="mt-1 text-text-secondary">{state.course.code} — {state.course.title}</p>}
          <div className="mt-6 rounded-xl bg-mint p-4">
            <p className="text-sm text-text-secondary">Registration reference</p>
            <p className="font-mono text-2xl font-bold tracking-wider text-primary">{state.reference}</p>
            <p className="mt-2 text-sm text-text-secondary">Matric number: <span className="font-medium text-text-main">{state.matric}</span></p>
          </div>
          <p className="mt-4 text-sm text-text-secondary">Keep this reference. At your first class you will enrol your fingerprint at the attendance station with your matric number.</p>
          <div className="no-print mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button>
            <Link to="/" className="btn-primary btn-md">Done</Link>
          </div>
        </Card>
      </div>
    </div>
  )
}
