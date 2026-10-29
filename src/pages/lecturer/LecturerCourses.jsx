import { Link } from 'react-router-dom'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useAuth } from '../../context/AuthContext'
import { db, run } from '../../services/api'

export default function LecturerCourses() {
  const { profile } = useAuth()
  const q = useQuery(async () => {
    const { data } = await run(db().from('course_lecturers').select('courses(id,code,title,level,departments(name))').eq('lecturer_id', profile.id))
    const rows = data.map((r) => r.courses)
    const counts = await Promise.all(rows.map(async (c) => ({ id: c.id, n: (await run(db().from('student_course_enrollments').select('id', { count: 'exact', head: true }).eq('course_id', c.id))).count })))
    return rows.map((c) => ({ ...c, students: counts.find((x) => x.id === c.id)?.n ?? 0 }))
  }, [profile.id])
  return (
    <>
      <PageHeader title="My courses" description="Courses an administrator has assigned to you." />
      <Card><QueryBoundary query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No courses assigned" message="Ask an administrator to assign courses to your account." />}>{(rows) => <DataTable rows={rows} columns={[
        { key: 'code', header: 'Code' }, { key: 'title', header: 'Title' }, { key: 'level', header: 'Level' }, { key: 'dept', header: 'Department', render: (r) => r.departments?.name },
        { key: 'students', header: 'Enrolled students' }, { key: 'a', header: '', render: () => <Link className="text-primary hover:underline" to="/lecturer/classes">Classes</Link> }]} />}</QueryBoundary></Card>
    </>
  )
}
