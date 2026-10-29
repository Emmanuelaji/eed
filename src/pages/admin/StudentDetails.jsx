import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card, CardTitle } from '../../components/ui/Card'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { StatusBadge } from '../../components/ui/Badge'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { QueryBoundary } from '../../components/ui/States'
import DataTable from '../../components/ui/DataTable'
import BiometricActions from '../../components/attendance/BiometricActions'
import { useQuery } from '../../hooks/useQuery'
import { useAuth } from '../../context/AuthContext'
import { db, run } from '../../services/api'
import { friendlyError } from '../../lib/errors'
import { formatDateTime, formatTime } from '../../lib/time'

export default function StudentDetails() {
  const { id } = useParams(); const { role } = useAuth(); const isAdmin = role === 'ADMIN'
  const q = useQuery(async () => {
    const [s, enr, att] = await Promise.all([
      run(db().from('students').select('*, departments(name)').eq('id', id).maybeSingle()),
      run(db().from('student_course_enrollments').select('id,reference,semester,registered_at,courses(code,title),academic_sessions(name)').eq('student_id', id).order('registered_at', { ascending: false })),
      run(db().from('attendance').select('id,sign_in_at,sign_out_at,status,sign_in_method,class_sessions(scheduled_start,courses(code))').eq('student_id', id).order('sign_in_at', { ascending: false }).limit(20)),
    ])
    return { student: s.data, enrolments: enr.data, attendance: att.data }
  }, [id])
  const [f, setF] = useState(null); const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data?.student) setF(q.data.student) }, [q.data])
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const save = async () => {
    setBusy(true)
    try {
      await run(db().from('students').update({ full_name: f.full_name.trim(), phone: f.phone, email: f.email, address: f.address, level: Number(f.level), registration_status: f.registration_status }).eq('id', id))
      toast.success('Student updated'); q.reload({ silent: true })
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <QueryBoundary query={q} isEmpty={(d) => !d.student} empty={<p className="py-12 text-center">Student not found or you do not have access.</p>}>
      {(d) => f && (<>
        <PageHeader title={d.student.full_name} description={`${d.student.matric_number} · ${d.student.departments?.name}`} />
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <div className="mb-4 flex items-center gap-4"><StudentAvatar path={d.student.passport_path} name={d.student.full_name} className="h-20 w-20" /><div className="space-x-2"><StatusBadge status={d.student.registration_status} /><StatusBadge status={d.student.biometric_status} /></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Full name" value={f.full_name} onChange={set('full_name')} disabled={!isAdmin} />
              <Input label="Matric number" value={f.matric_number} disabled hint="Matric numbers cannot be edited." />
              <Input label="Phone" value={f.phone || ''} onChange={set('phone')} disabled={!isAdmin} />
              <Input label="Email" value={f.email || ''} onChange={set('email')} disabled={!isAdmin} />
              <Select label="Level" value={f.level} onChange={set('level')} disabled={!isAdmin}>{[100, 200, 300, 400, 500].map((l) => <option key={l}>{l}</option>)}</Select>
              <Select label="Status" value={f.registration_status} onChange={set('registration_status')} disabled={!isAdmin}>{['REGISTERED', 'ACTIVE', 'SUSPENDED', 'GRADUATED', 'WITHDRAWN'].map((s) => <option key={s}>{s}</option>)}</Select>
              <div className="sm:col-span-2"><Textarea label="Address" value={f.address || ''} onChange={set('address')} disabled={!isAdmin} /></div>
            </div>
            {isAdmin && <Button className="mt-4" loading={busy} onClick={save}>Save changes</Button>}
          </Card>
          <div className="space-y-6">
            <Card><CardTitle>Biometric</CardTitle><p className="mt-2 text-sm text-text-secondary">Only an opaque scanner reference is stored — never a fingerprint image.</p>
              {isAdmin ? <BiometricActions student={d.student} onChanged={() => q.reload({ silent: true })} /> : <div className="mt-3"><StatusBadge status={d.student.biometric_status} /></div>}</Card>
            <Card><CardTitle>Course enrolments</CardTitle>
              <ul className="mt-2 divide-y divide-border text-sm">{d.enrolments.length === 0 ? <li className="py-2 text-text-secondary">None</li> : d.enrolments.map((e) => <li key={e.id} className="py-2"><span className="font-medium">{e.courses?.code}</span> · {e.academic_sessions?.name} {e.semester === 'FIRST' ? '1st' : '2nd'} sem<br /><span className="text-xs text-text-secondary">Ref {e.reference}</span></li>)}</ul></Card>
          </div>
        </div>
        <Card className="mt-6"><CardTitle>Recent attendance</CardTitle>
          {d.attendance.length === 0 ? <p className="py-6 text-center text-sm text-text-secondary">No attendance records.</p> :
            <DataTable rows={d.attendance} columns={[{ key: 'c', header: 'Course', render: (r) => r.class_sessions?.courses?.code }, { key: 'd', header: 'Date', render: (r) => formatDateTime(r.class_sessions?.scheduled_start) },
              { key: 'in', header: 'In', render: (r) => formatTime(r.sign_in_at) }, { key: 'out', header: 'Out', render: (r) => formatTime(r.sign_out_at) }, { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />}
        </Card>
      </>)}
    </QueryBoundary>
  )
}
