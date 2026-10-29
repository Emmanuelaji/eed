import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Input, { Select, Textarea } from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { QueryBoundary } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useAuth } from '../../context/AuthContext'
import { useBase } from '../../hooks/useBase'
import { db, run } from '../../services/api'
import { classSessionSchema } from '../../lib/validation'
import { addMinutes, lagosDateString, lagosTimeString, lagosToIso } from '../../lib/time'
import { friendlyError } from '../../lib/errors'

export default function ClassSessionForm() {
  const { id } = useParams(); const nav = useNavigate(); const base = useBase(); const { profile, role } = useAuth(); const isNew = !id
  const ref = useQuery(async () => {
    const [c, a, l, s, e] = await Promise.all([
      run(db().from('courses').select('id,code,title,department_id,level').order('code')),
      run(db().from('academic_sessions').select('id,name,is_current').order('name', { ascending: false })),
      run(db().from('profiles').select('id,full_name,email').in('role', ['LECTURER', 'ADMIN'])),
      run(db().from('app_settings').select('key,value')),
      isNew ? Promise.resolve({ data: null }) : run(db().from('class_sessions').select('*').eq('id', id).maybeSingle()),
    ])
    return { courses: c.data, sessions: a.data, lecturers: l.data, settings: Object.fromEntries(s.data.map((x) => [x.key, x.value])), existing: e.data }
  }, [id])
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(classSessionSchema) })
  const [lecturer, setLecturer] = useState('')
  useEffect(() => {
    if (!ref.data) return
    const { existing: x, settings: st, sessions } = ref.data
    if (x) {
      reset({ course_id: x.course_id, academic_session_id: x.academic_session_id, semester: x.semester, date: lagosDateString(x.scheduled_start), start: lagosTimeString(x.scheduled_start), end: lagosTimeString(x.scheduled_end),
        grace_minutes: Math.round((new Date(x.auto_close_at) - new Date(x.scheduled_end)) / 60000), early_signin_minutes: x.early_signin_minutes, late_after_minutes: x.late_after_minutes, venue: x.venue || '', instructions: x.instructions || '' })
      setLecturer(x.lecturer_id || '')
    } else {
      reset({ course_id: '', academic_session_id: sessions.find((s) => s.is_current)?.id || '', semester: 'FIRST', date: lagosDateString(), start: '08:00', end: '12:00', grace_minutes: Number(st.default_auto_close_grace_minutes ?? 15),
        early_signin_minutes: Number(st.default_early_signin_minutes ?? 0), late_after_minutes: Number(st.late_after_minutes ?? 15), venue: '', instructions: '' })
      setLecturer(profile.role === 'LECTURER' ? profile.id : '')
    }
  }, [ref.data, reset, profile])

  const onSubmit = async (v) => {
    try {
      const course = ref.data.courses.find((c) => c.id === v.course_id)
      const scheduled_start = lagosToIso(v.date, v.start); const scheduled_end = lagosToIso(v.date, v.end)
      const row = { course_id: v.course_id, department_id: course.department_id, level: course.level, academic_session_id: v.academic_session_id, semester: v.semester, scheduled_start, scheduled_end,
        auto_close_at: addMinutes(scheduled_end, v.grace_minutes), early_signin_minutes: v.early_signin_minutes, late_after_minutes: v.late_after_minutes, venue: v.venue || null, instructions: v.instructions || null, lecturer_id: lecturer || null }
      if (isNew) await run(db().from('class_sessions').insert({ ...row, created_by: profile.id })); else await run(db().from('class_sessions').update(row).eq('id', id))
      toast.success('Class session saved'); nav(`${base}/classes`)
    } catch (e) { toast.error(friendlyError(e)) }
  }
  const locked = ref.data?.existing && ref.data.existing.status !== 'SCHEDULED'
  return (
    <>
      <PageHeader title={isNew ? 'New class session' : 'Edit class session'} description="Times are in Nigeria time (Africa/Lagos)." />
      <QueryBoundary query={ref}>{(d) => (
        <Card className="max-w-3xl"><form onSubmit={handleSubmit(onSubmit)} className="grid gap-4 sm:grid-cols-2" noValidate>
          {locked && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2">This class is {d.existing.status}. Course and schedule can only be edited while it is SCHEDULED.</p>}
          <Select label="Course" required error={errors.course_id?.message} disabled={locked} {...register('course_id')}><option value="">Select…</option>{d.courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</Select>
          <Select label="Academic session" required error={errors.academic_session_id?.message} {...register('academic_session_id')}><option value="">Select…</option>{d.sessions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select>
          <Select label="Semester" {...register('semester')}><option value="FIRST">First</option><option value="SECOND">Second</option></Select>
          <Input label="Date" type="date" required error={errors.date?.message} disabled={locked} {...register('date')} />
          <Input label="Scheduled start" type="time" required error={errors.start?.message} disabled={locked} {...register('start')} />
          <Input label="Scheduled end" type="time" required error={errors.end?.message} disabled={locked} {...register('end')} />
          <Input label="Auto-close grace (minutes after scheduled end)" type="number" min="0" error={errors.grace_minutes?.message} hint="e.g. end 12:00 + 15 = auto-closes 12:15" disabled={locked} {...register('grace_minutes')} />
          <Input label="Early sign-in window (minutes before start)" type="number" min="0" error={errors.early_signin_minutes?.message} hint="0 = students can only sign in once the class is started." {...register('early_signin_minutes')} />
          <Input label="Late after (minutes past start)" type="number" min="0" error={errors.late_after_minutes?.message} {...register('late_after_minutes')} />
          <Input label="Venue" error={errors.venue?.message} {...register('venue')} />
          {role === 'ADMIN' ? <Select label="Assigned lecturer" value={lecturer} onChange={(e) => setLecturer(e.target.value)}><option value="">Unassigned</option>{d.lecturers.map((l) => <option key={l.id} value={l.id}>{l.full_name || l.email}</option>)}</Select> : <div />}
          <div className="sm:col-span-2"><Textarea label="Attendance instructions" {...register('instructions')} /></div>
          <div className="flex gap-2 sm:col-span-2"><Button type="submit" loading={isSubmitting}>Save class</Button><Button variant="outline" onClick={() => nav(`${base}/classes`)}>Cancel</Button></div>
        </form></Card>)}
      </QueryBoundary>
    </>
  )
}
