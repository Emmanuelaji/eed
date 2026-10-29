import { Link } from 'react-router-dom'
import { Activity, CalendarClock, Fingerprint, GraduationCap, PlayCircle, Radio, Users, UserCheck, Clock, ScanLine } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import PageHeader from '../../components/ui/PageHeader'
import StatCard from '../../components/ui/StatCard'
import { Card, CardTitle } from '../../components/ui/Card'
import { StatusBadge } from '../../components/ui/Badge'
import { EmptyState, ErrorState, Spinner } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useBase } from '../../hooks/useBase'
import { db, rpc, run } from '../../services/api'
import { formatDateTime, formatTimeSeconds } from '../../lib/time'
import { useAuth } from '../../context/AuthContext'

export default function Dashboard() {
  const base = useBase()
  const { profile } = useAuth()
  const stats = useQuery(async () => { await rpc('reconcile_sessions'); return rpc('dashboard_stats') }, [])
  const sessions = useQuery(async () => (await run(db().from('class_sessions').select('id,status,scheduled_start,venue,courses(code,title)').order('scheduled_start', { ascending: false }).limit(6))).data, [])
  const activity = useQuery(async () => (await run(db().from('attendance').select('id,sign_in_at,sign_out_at,sign_in_method,status,students(full_name,matric_number),class_sessions(courses(code))').order('updated_at', { ascending: false }).limit(8))).data, [])
  const live = useRealtime(['attendance', 'class_sessions'], () => { stats.reload({ silent: true }); sessions.reload({ silent: true }); activity.reload({ silent: true }) })
  const s = stats.data

  const quick = [
    ...(base === '/admin' ? [{ to: '/admin/registration-forms/new', label: 'Create registration form', icon: GraduationCap }, { to: '/admin/students', label: 'Manage students', icon: Users }] : []),
    { to: `${base}/classes/new`, label: 'Create class session', icon: CalendarClock },
    { to: `${base}/classes`, label: 'Start or reopen class', icon: PlayCircle },
    { to: '/scanner', label: 'Open attendance scanner', icon: ScanLine },
    { to: `${base}/reports`, label: 'View reports', icon: Activity },
  ]

  return (
    <>
      <PageHeader title={`Welcome${profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}`} description="Live overview from the database."
        actions={<span className={`badge ${live === 'live' ? 'badge-success' : 'badge-warning'}`}><Radio className="h-3 w-3" />{live === 'live' ? 'Live' : live === 'connecting' ? 'Connecting…' : 'Reconnecting…'}</span>} />
      {stats.loading && !s ? <Spinner /> : stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Registered students" value={s.total_students} icon={Users} />
          <StatCard label="Today's attendance" value={s.today_attendance} icon={UserCheck} hint={`${s.today_classes} class(es) today`} />
          <StatCard label="Present / Late" value={`${s.today_present} / ${s.today_late}`} icon={Clock} />
          <StatCard label="Currently signed in" value={s.currently_signed_in} icon={Activity} />
          <StatCard label="Active classes" value={s.active_classes} icon={PlayCircle} />
          <StatCard label="Upcoming classes" value={s.upcoming_classes} icon={CalendarClock} />
          <StatCard label="Fingerprint enrolled" value={s.biometric_enrolled} icon={Fingerprint} hint={`${s.biometric_not_enrolled} not enrolled`} />
          <StatCard label="Overrides today" value={s.today_overrides} icon={ScanLine} hint="Approved at the station" />
        </div>
      )}
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardTitle>Attendance trend (14 days)</CardTitle>
          <div className="mt-4 h-64">
            {s?.trend?.length ? (
              <ResponsiveContainer width="100%" height="100%"><BarChart data={s.trend}><CartesianGrid strokeDasharray="3 3" stroke="#DCE8DF" /><XAxis dataKey="day" fontSize={11} /><YAxis allowDecimals={false} fontSize={11} /><Tooltip /><Legend />
                <Bar dataKey="present" name="Present" stackId="a" fill="#006B3F" /><Bar dataKey="late" name="Late" stackId="a" fill="#D97706" /></BarChart></ResponsiveContainer>
            ) : <EmptyState title="No attendance yet" message="The chart fills in once students start signing in." />}
          </div>
        </Card>
        <Card>
          <CardTitle>Quick actions</CardTitle>
          <div className="mt-3 grid gap-2">{quick.map((q) => <Link key={q.to} to={q.to} className="btn-outline btn-md justify-start"><q.icon className="h-4 w-4 text-primary" aria-hidden="true" />{q.label}</Link>)}</div>
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>Recent class sessions</CardTitle>
          {sessions.error ? <ErrorState message={sessions.error} onRetry={sessions.reload} /> : !sessions.data ? <Spinner /> : sessions.data.length === 0 ? <EmptyState title="No class sessions" /> : (
            <ul className="mt-3 divide-y divide-border">{sessions.data.map((c) => (
              <li key={c.id}><Link to={`${base}/classes/${c.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-mint/40">
                <span className="min-w-0"><span className="block truncate font-medium">{c.courses?.code} — {c.courses?.title}</span><span className="text-xs text-text-secondary">{formatDateTime(c.scheduled_start)} · {c.venue || 'No venue'}</span></span><StatusBadge status={c.status} /></Link></li>
            ))}</ul>)}
        </Card>
        <Card>
          <CardTitle>Recent activity</CardTitle>
          {activity.error ? <ErrorState message={activity.error} onRetry={activity.reload} /> : !activity.data ? <Spinner /> : activity.data.length === 0 ? <EmptyState title="No activity yet" /> : (
            <ul className="mt-3 space-y-3">{activity.data.map((a) => (
              <li key={a.id} className="text-sm"><p className="font-medium">{a.students?.full_name}</p>
                <p className="text-xs text-text-secondary">{a.sign_out_at ? 'Signed out' : 'Signed in'} · {a.class_sessions?.courses?.code} · {formatTimeSeconds(a.sign_out_at || a.sign_in_at)}</p></li>))}</ul>)}
        </Card>
      </div>
    </>
  )
}
