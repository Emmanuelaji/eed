import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { QueryBoundary } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useAuth } from '../../context/AuthContext'
import { db, run } from '../../services/api'
import { friendlyError } from '../../lib/errors'
import { fromLagosInput, toLagosInput } from '../../lib/time'

export default function RegistrationFormEdit() {
  const { id } = useParams(); const nav = useNavigate(); const { profile } = useAuth(); const isNew = !id || id === 'new'
  const ref = useQuery(async () => {
    const [c, d, a, f] = await Promise.all([
      run(db().from('courses').select('id,code,title,department_id,level').order('code')), run(db().from('departments').select('id,name').order('name')),
      run(db().from('academic_sessions').select('id,name,is_current').order('name', { ascending: false })),
      isNew ? Promise.resolve({ data: null }) : run(db().from('registration_forms').select('*').eq('id', id).maybeSingle()),
    ])
    return { courses: c.data, depts: d.data, sessions: a.data, form: f.data }
  }, [id])
  const [v, setV] = useState({ name: '', course_id: '', department_id: '', level: 100, academic_session_id: '', semester: 'FIRST', deadline: '', max_registrations: '', instructions: '', is_active: true })
  const [busy, setBusy] = useState(false); const [err, setErr] = useState({})
  useEffect(() => {
    if (!ref.data) return
    if (ref.data.form) { const f = ref.data.form; setV({ ...f, deadline: toLagosInput(f.deadline), max_registrations: f.max_registrations ?? '', instructions: f.instructions ?? '' }) }
    else setV((x) => ({ ...x, academic_session_id: ref.data.sessions.find((s) => s.is_current)?.id || '' }))
  }, [ref.data])
  const set = (k) => (e) => setV({ ...v, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const pickCourse = (e) => { const c = ref.data.courses.find((x) => x.id === e.target.value); setV({ ...v, course_id: e.target.value, department_id: c?.department_id || v.department_id, level: c?.level || v.level, name: v.name || (c ? `${c.code} registration` : '') }) }

  const save = async () => {
    const e = {}
    if (!v.name.trim()) e.name = 'Required'; if (!v.course_id) e.course_id = 'Select a course'; if (!v.department_id) e.department_id = 'Select a department'; if (!v.academic_session_id) e.academic_session_id = 'Select a session'
    if (v.max_registrations !== '' && Number(v.max_registrations) < 1) e.max_registrations = 'Must be at least 1'
    setErr(e); if (Object.keys(e).length) return
    setBusy(true)
    const row = { name: v.name.trim(), course_id: v.course_id, department_id: v.department_id, level: Number(v.level), academic_session_id: v.academic_session_id, semester: v.semester,
      deadline: v.deadline ? fromLagosInput(v.deadline) : null, max_registrations: v.max_registrations === '' ? null : Number(v.max_registrations), instructions: v.instructions || null, is_active: v.is_active }
    try {
      if (isNew) await run(db().from('registration_forms').insert({ ...row, created_by: profile.id })); else await run(db().from('registration_forms').update(row).eq('id', id))
      toast.success('Saved'); nav('/admin/registration-forms')
    } catch (x) { toast.error(friendlyError(x)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title={isNew ? 'New registration form' : 'Edit registration form'} description="A secret public link is generated automatically." />
      <QueryBoundary query={ref}>{(d) => (
        <Card className="max-w-3xl"><div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Input label="Form name" required value={v.name} onChange={set('name')} error={err.name} /></div>
          <Select label="Course" required value={v.course_id} onChange={pickCourse} error={err.course_id}><option value="">Select…</option>{d.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</Select>
          <Select label="Department" required value={v.department_id} onChange={set('department_id')} error={err.department_id}><option value="">Select…</option>{d.depts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="Level" value={v.level} onChange={set('level')}>{[100, 200, 300, 400, 500].map((l) => <option key={l}>{l}</option>)}</Select>
          <Select label="Academic session" required value={v.academic_session_id} onChange={set('academic_session_id')} error={err.academic_session_id}><option value="">Select…</option>{d.sessions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          <Select label="Semester" value={v.semester} onChange={set('semester')}><option value="FIRST">First</option><option value="SECOND">Second</option></Select>
          <Input label="Deadline (Lagos time)" type="datetime-local" value={v.deadline} onChange={set('deadline')} hint="Leave empty for no deadline." />
          <Input label="Maximum registrations" type="number" min="1" value={v.max_registrations} onChange={set('max_registrations')} error={err.max_registrations} hint="Optional." />
          <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={v.is_active} onChange={set('is_active')} />Active</label>
          <div className="sm:col-span-2"><Textarea label="Instructions shown to students" value={v.instructions} onChange={set('instructions')} /></div>
        </div>
        <div className="mt-6 flex gap-2"><Button loading={busy} onClick={save}>Save form</Button><Button variant="outline" onClick={() => nav('/admin/registration-forms')}>Cancel</Button></div></Card>)}
      </QueryBoundary>
    </>
  )
}
