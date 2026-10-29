import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Input, { Select } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import DataTable from '../../components/ui/DataTable'
import Badge, { StatusBadge } from '../../components/ui/Badge'
import { QueryBoundary } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { db, rpc, run } from '../../services/api'
import { friendlyError } from '../../lib/errors'

export default function Users() {
  const q = useQuery(async () => {
    const [p, st, co, cl] = await Promise.all([run(db().from('profiles').select('*').order('created_at', { ascending: false })), run(db().from('students').select('id,matric_number,full_name').order('matric_number').limit(1000)),
      run(db().from('courses').select('id,code').order('code')), run(db().from('course_lecturers').select('course_id,lecturer_id'))])
    return { users: p.data, students: st.data, courses: co.data, assign: cl.data }
  }, [])
  const [u, setU] = useState(null); const [busy, setBusy] = useState(false)
  const assigned = (uid) => new Set(q.data.assign.filter((a) => a.lecturer_id === uid).map((a) => a.course_id))
  const save = async () => {
    setBusy(true)
    try {
      const r = await rpc('admin_update_profile', { p_user: u.id, p_role: u.role, p_full_name: u.full_name, p_student_id: u.student_id || null, p_is_active: u.is_active })
      if (!r.ok) throw new Error({ LAST_ADMIN: 'You cannot demote or deactivate the last administrator.', NOT_FOUND: 'User not found' }[r.code] || r.code)
      toast.success('User updated'); setU(null); q.reload({ silent: true })
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const toggleCourse = async (cid) => {
    try {
      if (assigned(u.id).has(cid)) await run(db().from('course_lecturers').delete().eq('course_id', cid).eq('lecturer_id', u.id)); else await run(db().from('course_lecturers').insert({ course_id: cid, lecturer_id: u.id }))
      q.reload({ silent: true })
    } catch (e) { toast.error(friendlyError(e)) }
  }
  return (
    <>
      <PageHeader title="Users & roles" description="New accounts are always created as STUDENT. Create the login in Supabase Auth, then assign the role here." />
      <Card><QueryBoundary query={q}>{(d) => <DataTable rows={d.users} columns={[
        { key: 'n', header: 'Name', render: (r) => r.full_name || '—' }, { key: 'e', header: 'Email', render: (r) => r.email }, { key: 'r', header: 'Role', render: (r) => <StatusBadge status={r.role} /> },
        { key: 'a', header: 'Active', render: (r) => (r.is_active ? <Badge variant="success">Active</Badge> : <Badge variant="error">Deactivated</Badge>) },
        { key: 'x', header: '', render: (r) => <Button size="sm" variant="ghost" aria-label={`Edit ${r.email}`} onClick={() => setU(r)}><Pencil className="h-4 w-4" /></Button> }]} />}</QueryBoundary></Card>
      <Modal open={!!u} onClose={() => setU(null)} title="Edit user" footer={<><Button variant="outline" onClick={() => setU(null)}>Close</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        {u && q.data && <div className="space-y-4"><Input label="Full name" value={u.full_name || ''} onChange={(e) => setU({ ...u, full_name: e.target.value })} />
          <Select label="Role" value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}><option>ADMIN</option><option>LECTURER</option><option>STUDENT</option></Select>
          <Select label="Linked student record (for student logins)" value={u.student_id || ''} onChange={(e) => setU({ ...u, student_id: e.target.value })}><option value="">None</option>{q.data.students.map((s) => <option key={s.id} value={s.id}>{s.matric_number} — {s.full_name}</option>)}</Select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={u.is_active} onChange={(e) => setU({ ...u, is_active: e.target.checked })} />Account active</label>
          {u.role === 'LECTURER' && <fieldset className="rounded-lg border border-border p-3"><legend className="px-1 text-sm font-medium">Assigned courses (saved immediately)</legend>
            <div className="flex flex-wrap gap-2">{q.data.courses.map((c) => <label key={c.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" className="accent-primary" checked={assigned(u.id).has(c.id)} onChange={() => toggleCourse(c.id)} />{c.code}</label>)}</div></fieldset>}
        </div>}
      </Modal>
    </>
  )
}
