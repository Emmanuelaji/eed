import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import { Card, CardTitle } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import DataTable from '../../components/ui/DataTable'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import OverrideForm, { OVERRIDE_REASONS } from '../../components/attendance/OverrideForm'
import { useQuery } from '../../hooks/useQuery'
import { db, rpc, run } from '../../services/api'
import { formatDateTime } from '../../lib/time'
import { RESULT_MESSAGES } from '../../lib/errors'

export default function Overrides() {
  const [sid, setSid] = useState(''); const [msg, setMsg] = useState(null); const [k, setK] = useState(0)
  const open = useQuery(async () => { await rpc('reconcile_sessions'); return (await run(db().from('class_sessions').select('id,scheduled_start,courses(code)').in('status', ['OPEN', 'REOPENED']).order('scheduled_start'))).data }, [])
  const hist = useQuery(async () => (await run(db().from('attendance_overrides').select('id,action,reason,notes,approved_at,students(full_name,matric_number),profiles!attendance_overrides_approved_by_fkey(full_name,email),class_sessions(courses(code))').order('approved_at', { ascending: false }).limit(50))).data, [k])
  return (
    <>
      <PageHeader title="Override approvals" description="Approve a single sign-in or sign-out when a fingerprint fails. Each approval is audited and never disables biometrics." />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2"><CardTitle>New override</CardTitle>
          <div className="mt-3 space-y-4"><Select label="Class (open classes only)" value={sid} onChange={(e) => { setSid(e.target.value); setMsg(null) }}><option value="">Select…</option>{open.data?.map((s) => <option key={s.id} value={s.id}>{s.courses?.code} · {formatDateTime(s.scheduled_start)}</option>)}</Select>
            {open.data?.length === 0 && <p className="text-sm text-text-secondary">No class is currently open.</p>}
            {sid && <OverrideForm key={`${sid}-${k}`} sessionId={sid} onDone={(r) => { setMsg(r); if (r.ok) setK((x) => x + 1) }} />}
            {msg && <p role="status" className={`rounded-lg p-3 text-sm ${msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>{msg.ok ? `${msg.student?.full_name}: ${msg.code === 'SIGN_IN_SUCCESS' ? 'signed in' : 'signed out'} (override)` : RESULT_MESSAGES[msg.code]?.message || msg.code}</p>}</div></Card>
        <Card className="lg:col-span-3"><CardTitle>Recent overrides</CardTitle>
          <QueryBoundary query={hist} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No overrides yet" />}>{(rows) => <DataTable rows={rows} columns={[
            { key: 's', header: 'Student', render: (r) => `${r.students?.full_name} (${r.students?.matric_number})` }, { key: 'c', header: 'Class', render: (r) => r.class_sessions?.courses?.code },
            { key: 'a', header: 'Action', render: (r) => (r.action === 'SIGN_IN' ? 'Sign-in' : 'Sign-out') }, { key: 'r', header: 'Reason', render: (r) => OVERRIDE_REASONS[r.reason] + (r.notes ? ` — ${r.notes}` : '') },
            { key: 'b', header: 'Approved by', render: (r) => r.profiles?.full_name || r.profiles?.email }, { key: 't', header: 'When', render: (r) => formatDateTime(r.approved_at) }]} />}</QueryBoundary></Card>
      </div>
    </>
  )
}
