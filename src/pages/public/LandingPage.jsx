import { Link } from 'react-router-dom'
import { Fingerprint, ClipboardList, ShieldCheck, LogIn } from 'lucide-react'
import Logo from '../../components/ui/Logo'
import { Card } from '../../components/ui/Card'

const features = [
  { icon: ClipboardList, title: 'Register once', text: 'Students register through a private link shared by their department.' },
  { icon: Fingerprint, title: 'Fingerprint attendance', text: 'Sign in and out of each class with a quick fingerprint scan.' },
  { icon: ShieldCheck, title: 'Secure and auditable', text: 'Every sensitive action is recorded and access is role-based.' },
]

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <Logo withText />
        <Link to="/login" className="btn-primary btn-md"><LogIn className="h-4 w-4" aria-hidden="true" />Staff &amp; student login</Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12 sm:py-20">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary sm:text-5xl">Electronic Entry &amp; Departure</h1>
          <p className="mx-auto mt-4 max-w-2xl text-text-secondary">Student registration, classroom attendance and entry/exit tracking with fingerprint identification.</p>
          <p className="mx-auto mt-6 max-w-xl rounded-xl bg-mint p-4 text-sm text-primary">
            New student? Use the registration link or QR code shared by your department. Registration links look like <code className="font-mono">/register/ABC123…</code>
          </p>
        </div>
        <div className="mt-12 grid gap-4 sm:grid-cols-3">
          {features.map(({ icon: Icon, title, text }) => (
            <Card key={title}><Icon className="h-8 w-8 text-primary" aria-hidden="true" /><h2 className="mt-3 font-semibold">{title}</h2><p className="mt-1 text-sm text-text-secondary">{text}</p></Card>
          ))}
        </div>
      </main>
    </div>
  )
}
