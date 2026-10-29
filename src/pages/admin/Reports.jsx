import { useState } from 'react'
import { Download, Printer } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Input, { Select } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import DataTable, { Pagination } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/Badge'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { db, run } from '../../services/api'
import { downloadCsv, toCsv } from '../../lib/csv'
import { formatDateTime, formatTimeSeconds, lagosDateString, lagosToIso } from '../../lib/time'
import { formatDuration } from '../../lib/attendance'
import { OVERRIDE_REASONS } from '../../components/attendance/OverrideForm'

const PAGE = 25
const COLS = [
  { label: 'Matric number', value: 'matric_number' }, { label: 'Name', value: 'full_name' }, { label: 'Class date', value: (r) => formatDateTime(r.scheduled_start) },
  { label: 'Status', value: 'attendance_status' }, { label: 'Sign-in', value: (r) => formatTimeSeconds(r.sign_in_at) }, { label: 'Sign-out', value: (r) => formatTimeSeconds(r.sign_out_at) },
  { label: 'Duration', value: (r) => formatDuration(r.duration_minutes) }, { label: 'Sign-in method', value: 'sign_in_method' }, { label: 'First enrolment', value: (r) => (r.first_enrollment ? 'Yes' : 'No') },
]

export default function Reports() {
  const [f, setF] = useState({ from: '', to: '', course: '', dept: '', level: '', acad: '', sem: '', session: '', student: '', status: '', method: '' })
  const [applied, setApplied] = useState(f); const [page, setPage] = useState(0)
  const ref = useQuery(async () => {
    const [c, d, a, s] = await Promise.all([run(db().from('courses').select('id,code').order('code')), run(db().from('departments').select('id,name').order('name')), run(db().from('academic_sessions').select('id,name').order('name')),
      run(db().from('class_sessions').select('id,scheduled_start,courses(code)').order('scheduled_start', { ascending: false }).limit(200))])
    return { courses: c.data, depts: d.data, acads: a.data, sessions: s.data }
  }, [])
  const build = (query, a) => {
    if (a.from) query = query.gte('scheduled_start', lagosToIso(a.from, '00:00')); if (a.to) query = query.lt('scheduled_start', lagosToIso(lagosDateString(new Date(new Date(lagosToIso(a.to, '00:00')).getTime() + 86400000)), '00:00'))
    if (a.course) query = query.eq('course_id', a.course); if (a.dept) query = query.eq('department_id', a.dept); if (a.level) query = query.eq('level', Number(a.level)); if (a.acad) query = query.eq('academic_session_id', a.acad)
    if (a.sem) query = query.eq('semester', a.sem); if (a.session) query = query.eq('class_session_id', a.session)
    if (a.student.trim()) { const t = a.student.trim().replace(/[%,()]/g, ''); query = query.or(`full_name.ilike.%${t}%,matric_number.ilike.%${t}%`) }
    if (a.status === 'NOT_SIGNED_OUT') query = query.eq('not_signed_out', true); else if (a.status) query = query.eq('attendance_status', a.status)
    if (a.method === 'FIRST_ENROLLMENT') query = query.eq('first_enrollment', true); else if (a.method) query = query.eq('sign_in_method', a.method)
    return query
  }
  const q = useQuery(async () => {
    const { data, count } = await run(build(db().from('session_roster').select('*', { count: 'exact' }).order('scheduled_start', { ascending: false }).order('full_name').range(page * PAGE, page * PAGE + PAGE - 1), applied))
    return { rows: data, count }
  }, [applied, page])
  const exportCsv = async () => {
    const { data } = await run(build(db().from('session_roster').select('*').order('scheduled_start', { ascending: false }).order('full_name').limit(10000), applied))
    downloadCsv(`eed-attendance-${lagosDateString()}.csv`, toCsv(data, COLS))
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <>
      <PageHeader title="Attendance reports" description="Absent = enrolled but no record in a closed class. Dates use Africa/Lagos."
        actions={<><Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button><Button onClick={exportCsv}><Download className="h-4 w-4" />Export CSV</Button></>} />
      <Card className="no-print mb-6"><form onSubmit={(e) => { e.preventDefault(); setPage(0); setApplied(f) }} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="From date" type="date" value={f.from} onChange={set('from')} /><Input label="To date" type="date" value={f.to} onChange={set('to')} />
        <Select label="Course" value={f.course} onChange={set('course')}><option value="">All</option>{ref.data?.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}</Select>
        <Select label="Department" value={f.dept} onChange={set('dept')}><option value="">All</option>{ref.data?.depts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select label="Level" value={f.level} onChange={set('level')}><option value="">All</option>{[100, 200, 300, 400, 500].map((l) => <option key={l}>{l}</option>)}</Select>
        <Select label="Academic session" value={f.acad} onChange={set('acad')}><option value="">All</option>{ref.data?.acads.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        <Select label="Semester" value={f.sem} onChange={set('sem')}><option value="">All</option><option value="FIRST">First</option><option value="SECOND">Second</option></Select>
        <Select label="Class session" value={f.session} onChange={set('session')}><option value="">All</option>{ref.data?.sessions.map((c) => <option key={c.id} value={c.id}>{c.courses?.code} · {formatDateTime(c.scheduled_start)}</option>)}</Select>
        <Input label="Student (name or matric)" value={f.student} onChange={set('student')} />
        <Select label="Status" value={f.status} onChange={set('status')}><option value="">All</option><option value="PRESENT">Present</option><option value="LATE">Late</option><option value="ABSENT">Absent</option><option value="PENDING">Pending (class not finished)</option><option value="NOT_SIGNED_OUT">Signed in, not signed out</option></Select>
        <Select label="Verification" value={f.method} onChange={set('method')}><option value="">All</option><option value="FINGERPRINT">Fingerprint verified</option><option value="ADMIN_OVERRIDE">Admin override</option><option value="FIRST_ENROLLMENT">First-time enrolment</option></Select>
        <div className="flex items-end"><Button type="submit" className="w-full">Apply filters</Button></div></form></Card>
      <Card><QueryBoundary query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No records match" message="Adjust the filters." />}>{(d) => (<>
        <p className="mb-3 text-sm text-text-secondary">{d.count} row(s)</p>
        <DataTable rowKey="rk" rows={d.rows.map((r) => ({ ...r, rk: `${r.class_session_id}-${r.student_id}` }))} columns={[
          { key: 'm', header: 'Matric', render: (r) => r.matric_number }, { key: 'n', header: 'Name', render: (r) => r.full_name }, { key: 'd', header: 'Class', render: (r) => formatDateTime(r.scheduled_start) },
          { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.attendance_status} /> }, { key: 'i', header: 'In', render: (r) => formatTimeSeconds(r.sign_in_at) }, { key: 'o', header: 'Out', render: (r) => (r.not_signed_out ? 'Not signed out' : formatTimeSeconds(r.sign_out_at)) },
          { key: 'du', header: 'Duration', render: (r) => formatDuration(r.duration_minutes) }, { key: 'me', header: 'Method', render: (r) => (r.sign_in_method ? <StatusBadge status={r.sign_in_method} /> : '—') }]} />
        <Pagination page={page} pageSize={PAGE} total={d.count || 0} onPage={setPage} /></>)}</QueryBoundary></Card>
    </>
  )
}
