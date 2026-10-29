import { CalendarDays, Fingerprint, History } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { Card, CardTitle } from '../../components/ui/Card'
import StatCard from '../../components/ui/StatCard'
import DataTable from '../../components/ui/DataTable'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { StatusBadge } from '../../components/ui/Badge'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useAuth } from '../../context/AuthContext'
import { db, run } from '../../services/api'
import { formatDate, formatDateTime, formatTime, formatTimeSeconds } from '../../lib/time'
import { formatDuration } from '../../lib/attendance'

const NOT_LINKED = <EmptyState title="Account not linked to a student record" message="Ask an administrator to link your login to your student record." />

function useStudent() {
  const { profile } = useAuth()
  return useQuery(async () => {
    if (!profile?.student_id) return { linked: false }
    const { data } = await run(db().from('students').select('*, departments(name)').eq('id', profile.student_id).maybeSingle())
    return { linked: true, student: data }
  }, [profile?.student_id])
}

export function StudentDashboard() {
  const sq = useStudent()
  const q = useQuery(async () => {
    const [att, up, enr] = await Promise.all([
      run(db().from('attendance').select('id,status', { count: 'exact' })),
      run(db().from('class_sessions').select('id,scheduled_start,venue,status,courses(code,title)').in('status', ['SCHEDULED', 'OPEN', 'REOPENED']).order('scheduled_start').limit(5)),
      run(db().from('student_course_enrollments').select('id', { count: 'exact', head: true })),
    ])
    return { total: att.count, late: att.data.filter((a) => a.status === 'LATE').length, upcoming: up.data, courses: enr.count }
  }, [])
  return (
    <>
      <PageHeader title="My dashboard" />
      <QueryBoundary query={sq}>{(s) => !s.linked ? NOT_LINKED : (
        <div className="space-y-6">
          <Card className="flex items-center gap-4"><StudentAvatar path={s.student?.passport_path} name={s.student?.full_name} className="h-16 w-16" /><div><p className="text-lg font-semibold">{s.student?.full_name}</p><p className="text-sm text-text-secondary">{s.student?.matric_number} · {s.student?.departments?.name}</p></div></Card>
          <QueryBoundary query={q}>{(d) => (<>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4"><StatCard label="Courses" value={d.courses} icon={CalendarDays} /><StatCard label="Classes attended" value={d.total} icon={History} /><StatCard label="Times late" value={d.late} /><StatCard label="Fingerprint" value={<StatusBadge status={s.student?.biometric_status} />} icon={Fingerprint} /></div>
            <Card><CardTitle>Upcoming classes</CardTitle>{d.upcoming.length === 0 ? <EmptyState title="No upcoming classes" /> : <ul className="mt-3 divide-y divide-border">{d.upcoming.map((c) => <li key={c.id} className="flex items-center justify-between gap-3 py-3 text-sm"><span><span className="font-medium">{c.courses?.code}</span> · {c.courses?.title}<br /><span className="text-text-secondary">{formatDateTime(c.scheduled_start)} · {c.venue || 'No venue'}</span></span><StatusBadge status={c.status} /></li>)}</ul>}</Card></>)}</QueryBoundary>
        </div>)}</QueryBoundary>
    </>
  )
}

export function StudentProfile() {
  const sq = useStudent()
  return (<><PageHeader title="My profile" /><QueryBoundary query={sq}>{(s) => !s.linked || !s.student ? NOT_LINKED : (
    <Card className="max-w-2xl"><div className="flex items-center gap-4"><StudentAvatar path={s.student.passport_path} name={s.student.full_name} className="h-24 w-24" /><div><p className="text-xl font-semibold">{s.student.full_name}</p><StatusBadge status={s.student.registration_status} /></div></div>
      <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">{[['Matric number', s.student.matric_number], ['Department', s.student.departments?.name], ['Level', s.student.level], ['Phone', s.student.phone], ['Email', s.student.email], ['Address', s.student.address]].map(([k, v]) => <div key={k}><dt className="text-text-secondary">{k}</dt><dd className="font-medium">{v || '—'}</dd></div>)}</dl>
      <p className="mt-4 text-xs text-text-secondary">To correct your details, contact your department administrator.</p></Card>)}</QueryBoundary></>)
}

export function StudentAttendance() {
  const q = useQuery(async () => (await run(db().from('attendance').select('id,sign_in_at,sign_out_at,status,sign_in_method,duration_minutes,class_sessions(scheduled_start,courses(code,title))').order('sign_in_at', { ascending: false }))).data, [])
  return (<><PageHeader title="Attendance history" /><Card><QueryBoundary query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No attendance yet" message="Your sign-ins will appear here." />}>{(rows) => <DataTable rows={rows} columns={[
    { key: 'c', header: 'Course', render: (r) => r.class_sessions?.courses?.code }, { key: 'd', header: 'Date', render: (r) => formatDate(r.class_sessions?.scheduled_start) },
    { key: 'i', header: 'Signed in', render: (r) => formatTimeSeconds(r.sign_in_at) }, { key: 'o', header: 'Signed out', render: (r) => formatTimeSeconds(r.sign_out_at) }, { key: 'du', header: 'Duration', render: (r) => formatDuration(r.duration_minutes) },
    { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'm', header: 'Method', render: (r) => <StatusBadge status={r.sign_in_method} /> }]} />}</QueryBoundary></Card></>)
}

export function StudentSchedule() {
  const q = useQuery(async () => (await run(db().from('class_sessions').select('id,status,scheduled_start,scheduled_end,venue,courses(code,title)').neq('status', 'CANCELLED').gte('scheduled_start', new Date(Date.now() - 86400000).toISOString()).order('scheduled_start').limit(100))).data, [])
  return (<><PageHeader title="Class schedule" description="Times are Nigeria time." /><Card><QueryBoundary query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No upcoming classes" />}>{(rows) => <DataTable rows={rows} columns={[
    { key: 'c', header: 'Course', render: (r) => `${r.courses?.code} — ${r.courses?.title}` }, { key: 'd', header: 'Date', render: (r) => formatDate(r.scheduled_start) }, { key: 't', header: 'Time', render: (r) => `${formatTime(r.scheduled_start)} – ${formatTime(r.scheduled_end)}` },
    { key: 'v', header: 'Venue' }, { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}</QueryBoundary></Card></>)
}

export function StudentBiometric() {
  const sq = useStudent()
  return (<><PageHeader title="Biometric status" /><QueryBoundary query={sq}>{(s) => !s.linked || !s.student ? NOT_LINKED : (
    <Card className="max-w-xl text-center"><Fingerprint className="mx-auto h-14 w-14 text-primary" aria-hidden="true" /><div className="mt-3"><StatusBadge status={s.student.biometric_status} /></div>
      <p className="mt-4 text-sm text-text-secondary">{s.student.biometric_status === 'ENROLLED' ? 'Your fingerprint is enrolled. Use the scanner when you enter and leave class. If it fails, ask the lecturer to verify you with your matric number.' : 'You have not enrolled your fingerprint yet. Go to the attendance station at your next class with your matric number to enrol.'}</p></Card>)}</QueryBoundary></>)
}
