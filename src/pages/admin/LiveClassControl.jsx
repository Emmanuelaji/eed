import { useMemo, useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Ban, Pencil, Play, RotateCcw, ScanLine, Square, Radio } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card, CardTitle } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Input, { Textarea } from '../../components/ui/Input'
import Modal, { ConfirmDialog } from '../../components/ui/Modal'
import { StatusBadge } from '../../components/ui/Badge'
import DataTable from '../../components/ui/DataTable'
import StatCard from '../../components/ui/StatCard'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useBase } from '../../hooks/useBase'
import { db, rpc, run } from '../../services/api'
import { sessionPhase } from '../../lib/attendance'
import { formatDateTime, formatTime, formatTimeSeconds, fromLagosInput, toLagosInput, addMinutes } from '../../lib/time'
import { formatDuration } from '../../lib/attendance'
import { friendlyError } from '../../lib/errors'

const PHASE = { WAITING_TO_START: 'Waiting to start', START_DUE: 'Start time reached — not started yet', IN_PROGRESS: 'In progress', GRACE_PERIOD: 'Scheduled end passed — grace period', AUTO_CLOSED: 'Automatically closed', CLOSED: 'Closed', CANCELLED: 'Cancelled' }

export default function LiveClassControl() {
  const { id } = useParams(); const base = useBase()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 15000); return () => clearInterval(t) }, [])
  const q = useQuery(async () => {
    await rpc('reconcile_sessions')
    const [s, a, r] = await Promise.all([
      run(db().from('class_sessions').select('*, courses(code,title), profiles!class_sessions_lecturer_id_fkey(full_name)').eq('id', id).maybeSingle()),
      run(db().from('attendance').select('id,sign_in_at,sign_out_at,status,sign_in_method,sign_out_method,duration_minutes,first_enrollment,students(id,full_name,matric_number,passport_path)').eq('class_session_id', id).order('sign_in_at', { ascending: false })),
      run(db().from('session_roster').select('student_id', { count: 'exact', head: true }).eq('class_session_id', id)),
    ])
    return { session: s.data, attendance: a.data, rosterCount: r.count }
  }, [id])
  const live = useRealtime(['attendance', 'class_sessions'], () => q.reload({ silent: true }))
  const [dlg, setDlg] = useState(null); const [reason, setReason] = useState(''); const [deadline, setDeadline] = useState(''); const [busy, setBusy] = useState(false)

  const act = async (fn, okMsg) => {
    setBusy(true)
    try { const r = await fn(); if (r?.ok === false) toast.error(r.message || r.code); else { toast.success(okMsg); setDlg(null); setReason('') } q.reload({ silent: true }) }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const openReopen = () => { setDeadline(toLagosInput(addMinutes(new Date().toISOString(), 30))); setDlg('reopen') }
  const s = q.data?.session
  const phase = s ? sessionPhase(s, now) : null
  const stats = useMemo(() => { const a = q.data?.attendance || []; return { total: a.length, present: a.filter((x) => x.status === 'PRESENT').length, late: a.filter((x) => x.status === 'LATE').length, inside: a.filter((x) => !x.sign_out_at).length } }, [q.data])

  return (
    <QueryBoundary query={q} isEmpty={(d) => !d.session} empty={<EmptyState title="Class not found" message="It may not exist or you may not have access." />}>
      {(d) => (<>
        <PageHeader title={`${d.session.courses?.code} — ${d.session.courses?.title}`} description={`${d.session.venue || 'No venue'} · Lecturer: ${d.session.profiles?.full_name || 'Unassigned'}`}
          actions={<><span className={`badge ${live === 'live' ? 'badge-success' : 'badge-warning'}`}><Radio className="h-3 w-3" />{live === 'live' ? 'Live' : 'Reconnecting…'}</span>
            {d.session.status === 'SCHEDULED' && <Link to={`${base}/classes/${id}/edit`} className="btn-outline btn-md"><Pencil className="h-4 w-4" />Edit</Link>}
            <Link to={`/scanner/${id}`} className="btn-primary btn-md"><ScanLine className="h-4 w-4" />Open scanner</Link></>} />
        <Card className="mb-6">
          <div className="flex flex-wrap items-center gap-3"><StatusBadge status={d.session.status} /><span className="text-sm text-text-secondary">{PHASE[phase]}</span></div>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-text-secondary">Scheduled start</dt><dd className="font-medium">{formatDateTime(d.session.scheduled_start)}</dd></div>
            <div><dt className="text-text-secondary">Scheduled end</dt><dd className="font-medium">{formatDateTime(d.session.scheduled_end)}</dd></div>
            <div><dt className="text-text-secondary">Auto-close deadline</dt><dd className="font-medium">{formatDateTime(d.session.auto_close_at)}</dd></div>
            <div><dt className="text-text-secondary">Closed / ended</dt><dd className="font-medium">{d.session.closed_at ? formatDateTime(d.session.closed_at) : d.session.auto_closed_at ? `${formatDateTime(d.session.auto_closed_at)} (auto)` : '—'}</dd></div>
          </dl>
          {d.session.reopened_at && <p className="mt-3 text-xs text-text-secondary">Reopened {formatDateTime(d.session.reopened_at)}{d.session.status_reason ? ` — ${d.session.status_reason}` : ''}</p>}
          <div className="no-print mt-5 flex flex-wrap gap-2">
            {d.session.status === 'SCHEDULED' && <Button onClick={() => act(() => rpc('start_class', { p_session: id }), 'Class started')} loading={busy}><Play className="h-4 w-4" />Start class</Button>}
            {d.session.status === 'AUTO_CLOSED' && <Button onClick={openReopen}><RotateCcw className="h-4 w-4" />Reopen class</Button>}
            {['OPEN', 'REOPENED', 'AUTO_CLOSED'].includes(d.session.status) && <Button variant="outline" onClick={() => setDlg('end')}><Square className="h-4 w-4" />End class</Button>}
            {!['CLOSED', 'CANCELLED'].includes(d.session.status) && <Button variant="outline" onClick={() => setDlg('cancel')}><Ban className="h-4 w-4" />Cancel class</Button>}
          </div>
        </Card>
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Enrolled" value={d.rosterCount} /><StatCard label="Signed in" value={stats.total} hint={`${stats.present} present · ${stats.late} late`} /><StatCard label="Still inside" value={stats.inside} hint="No sign-out yet" /><StatCard label="Not yet seen" value={Math.max(0, (d.rosterCount || 0) - stats.total)} />
        </div>
        <Card><CardTitle>Live attendance</CardTitle>
          {d.attendance.length === 0 ? <EmptyState title="No sign-ins yet" /> : <DataTable rows={d.attendance} columns={[
            { key: 'p', header: '', hideOnMobile: true, render: (a) => <StudentAvatar path={a.students?.passport_path} name={a.students?.full_name} /> },
            { key: 'n', header: 'Student', render: (a) => <span><span className="font-medium">{a.students?.full_name}</span><br /><span className="text-xs text-text-secondary">{a.students?.matric_number}{a.first_enrollment ? ' · first enrolment' : ''}</span></span> },
            { key: 'in', header: 'Sign-in', render: (a) => `${formatTimeSeconds(a.sign_in_at)}` }, { key: 'out', header: 'Sign-out', render: (a) => formatTimeSeconds(a.sign_out_at) },
            { key: 'dur', header: 'Duration', render: (a) => formatDuration(a.duration_minutes) }, { key: 'st', header: 'Status', render: (a) => <StatusBadge status={a.status} /> }, { key: 'm', header: 'Method', render: (a) => <StatusBadge status={a.sign_in_method} /> }]} />}
        </Card>
        <ConfirmDialog open={dlg === 'end'} onClose={() => setDlg(null)} loading={busy} confirmLabel="End class" title="End this class?" onConfirm={() => act(() => rpc('end_class', { p_session: id, p_reason: reason || null }), 'Class ended')}
          message={<span className="block"><span className="mb-2 block">Final closure stops all sign-in and sign-out. Students without a sign-out are kept and flagged in reports.</span><Textarea label="Note (optional)" value={reason} onChange={(e) => setReason(e.target.value)} /></span>} />
        <ConfirmDialog open={dlg === 'cancel'} onClose={() => setDlg(null)} loading={busy} danger confirmLabel="Cancel class" title="Cancel this class?" onConfirm={() => act(() => rpc('cancel_class', { p_session: id, p_reason: reason }), 'Class cancelled')}
          message={<Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />} />
        <Modal open={dlg === 'reopen'} onClose={() => setDlg(null)} title="Reopen class" footer={<><Button variant="outline" onClick={() => setDlg(null)}>Cancel</Button><Button loading={busy} onClick={() => act(() => rpc('reopen_class', { p_session: id, p_new_deadline: fromLagosInput(deadline), p_reason: reason }), 'Class reopened')}>Reopen</Button></>}>
          <p className="mb-3 text-sm text-text-secondary">Set a NEW closing deadline (Lagos time). The class will not auto-close again until then.</p>
          <div className="space-y-4"><Input label="New closing deadline" type="datetime-local" required value={deadline} onChange={(e) => setDeadline(e.target.value)} /><Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </Modal>
      </>)}
    </QueryBoundary>
  )
}
