import { useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import DataTable, { Pagination } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/Badge'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useAuth } from '../../context/AuthContext'
import { db, rpc, run } from '../../services/api'
import { formatDateTime, formatTimeSeconds, fromLagosInput, toLagosInput } from '../../lib/time'
import { formatDuration } from '../../lib/attendance'
import { friendlyError } from '../../lib/errors'

const PAGE = 20
export default function AttendanceRecords() {
  const { role } = useAuth()
  const [status, setStatus] = useState(''); const [method, setMethod] = useState(''); const [sess, setSess] = useState(''); const [page, setPage] = useState(0)
  const sessions = useQuery(async () => (await run(db().from('class_sessions').select('id,scheduled_start,courses(code)').order('scheduled_start', { ascending: false }).limit(100))).data, [])
  const q = useQuery(async () => {
    let query = db().from('attendance').select('id,sign_in_at,sign_out_at,sign_in_method,sign_out_method,status,duration_minutes,first_enrollment,class_session_id,students(full_name,matric_number),class_sessions(scheduled_start,courses(code))', { count: 'exact' }).order('sign_in_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (status) query = query.eq('status', status); if (method) query = query.eq('sign_in_method', method); if (sess) query = query.eq('class_session_id', sess)
    const { data, count } = await run(query); return { rows: data, count }
  }, [status, method, sess, page])
  const [sel, setSel] = useState(null); const [form, setForm] = useState({}); const [busy, setBusy] = useState(false)
  const openRow = (r) => { setSel(r); setForm({ status: r.status, sign_in_at: toLagosInput(r.sign_in_at), sign_out_at: toLagosInput(r.sign_out_at), reason: '' }) }
  const correct = async () => {
    setBusy(true)
    try {
      const r = await rpc('correct_attendance', { p_attendance: sel.id, p_status: form.status, p_sign_in_at: fromLagosInput(form.sign_in_at), p_sign_out_at: form.sign_out_at ? fromLagosInput(form.sign_out_at) : null, p_reason: form.reason })
      if (!r.ok) toast.error({ REASON_REQUIRED: 'A reason of at least 5 characters is required', INVALID_TIMES: 'Sign-out must be after sign-in' }[r.code] || r.code); else { toast.success('Attendance corrected and audited'); setSel(null); q.reload({ silent: true }) }
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const f = (set) => (e) => { set(e.target.value); setPage(0) }
  return (
    <>
      <PageHeader title="Attendance records" description="Records are written only by the attendance functions. Admins can correct with a mandatory reason." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <Select label="Class" value={sess} onChange={f(setSess)}><option value="">All</option>{sessions.data?.map((s) => <option key={s.id} value={s.id}>{s.courses?.code} · {formatDateTime(s.scheduled_start)}</option>)}</Select>
          <Select label="Status" value={status} onChange={f(setStatus)}><option value="">All</option><option>PRESENT</option><option>LATE</option></Select>
          <Select label="Sign-in method" value={method} onChange={f(setMethod)}><option value="">All</option><option>FINGERPRINT</option><option>ADMIN_OVERRIDE</option></Select>
        </div>
        <QueryBoundary query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No attendance records" />}>{(d) => (<><DataTable rows={d.rows} onRowClick={openRow} columns={[
          { key: 's', header: 'Student', render: (r) => `${r.students?.full_name} (${r.students?.matric_number})` }, { key: 'c', header: 'Class', render: (r) => `${r.class_sessions?.courses?.code} · ${formatDateTime(r.class_sessions?.scheduled_start)}` },
          { key: 'i', header: 'In', render: (r) => formatTimeSeconds(r.sign_in_at) }, { key: 'o', header: 'Out', render: (r) => formatTimeSeconds(r.sign_out_at) }, { key: 'd', header: 'Duration', render: (r) => formatDuration(r.duration_minutes) },
          { key: 'st', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }, { key: 'm', header: 'Method', render: (r) => <StatusBadge status={r.sign_in_method} /> }]} /><Pagination page={page} pageSize={PAGE} total={d.count || 0} onPage={setPage} /></>)}</QueryBoundary>
      </Card>
      <Modal open={!!sel} onClose={() => setSel(null)} title="Attendance details" footer={role === 'ADMIN' && <Button loading={busy} onClick={correct}>Save correction</Button>}>
        {sel && <div className="space-y-4"><p className="text-sm"><strong>{sel.students?.full_name}</strong> · {sel.class_sessions?.courses?.code}<br />In: {sel.sign_in_method} · Out: {sel.sign_out_method || '—'}{sel.first_enrollment ? ' · First biometric enrolment' : ''}</p>
          {role === 'ADMIN' ? (<><Select label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>PRESENT</option><option>LATE</option></Select>
            <Input label="Sign-in (Lagos)" type="datetime-local" value={form.sign_in_at} onChange={(e) => setForm({ ...form, sign_in_at: e.target.value })} />
            <Input label="Sign-out (Lagos)" type="datetime-local" value={form.sign_out_at} onChange={(e) => setForm({ ...form, sign_out_at: e.target.value })} />
            <Textarea label="Reason for correction" required value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></>) : <p className="text-sm text-text-secondary">Only administrators can correct attendance.</p>}</div>}
      </Modal>
    </>
  )
}
