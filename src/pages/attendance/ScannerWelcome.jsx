import { Link } from 'react-router-dom'
import { ArrowLeft, ScanLine } from 'lucide-react'
import Logo from '../../components/ui/Logo'
import { Card } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useAuth, homeForRole } from '../../context/AuthContext'
import { db, rpc, run } from '../../services/api'
import { formatDateTime, formatTime } from '../../lib/time'

export default function ScannerWelcome() {
  const { role } = useAuth()
  const q = useQuery(async () => { await rpc('reconcile_sessions'); return (await run(db().from('class_sessions').select('id,status,scheduled_start,scheduled_end,venue,courses(code,title)').in('status', ['OPEN', 'REOPENED', 'SCHEDULED']).gte('auto_close_at', new Date().toISOString()).order('scheduled_start').limit(20))).data }, [])
  return (
    <div className="min-h-screen bg-background p-4"><div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between"><Logo withText /><Link to={homeForRole(role)} className="btn-outline btn-sm"><ArrowLeft className="h-4 w-4" />Dashboard</Link></div>
      <h1 className="text-2xl font-bold">Attendance station</h1><p className="mb-4 text-sm text-text-secondary">Choose the class this station is for.</p>
      <QueryBoundary query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No classes available" message="Create or start a class session first." />}>{(rows) => (
        <div className="space-y-3">{rows.map((c) => <Link key={c.id} to={`/scanner/${c.id}`}><Card className="flex items-center justify-between gap-3 !p-4 hover:border-secondary"><div className="min-w-0"><p className="font-semibold">{c.courses?.code} — {c.courses?.title}</p><p className="text-sm text-text-secondary">{formatDateTime(c.scheduled_start)} – {formatTime(c.scheduled_end)} · {c.venue || 'No venue'}</p></div><div className="flex items-center gap-2"><StatusBadge status={c.status} /><ScanLine className="h-5 w-5 text-primary" /></div></Card></Link>)}</div>)}</QueryBoundary>
    </div></div>
  )
}
