import CrudPage from '../../components/ui/CrudPage'
import Badge from '../../components/ui/Badge'
import { db, run } from '../../services/api'

const deptOptions = async () => (await run(db().from('departments').select('id,name').order('name'))).data.map((d) => ({ value: d.id, label: d.name }))

export const Departments = () => (
  <CrudPage title="Departments" noun="department" table="departments" order="name" select="*"
    fields={[{ name: 'code', label: 'Code', required: true }, { name: 'name', label: 'Name', required: true }]}
    columns={[{ key: 'code', header: 'Code' }, { key: 'name', header: 'Name' }]} />
)

export const Courses = () => (
  <CrudPage title="Courses" noun="course" table="courses" order="code" select="*, departments(name)"
    fields={[{ name: 'code', label: 'Course code', required: true }, { name: 'title', label: 'Title', required: true }, { name: 'department_id', label: 'Department', type: 'select', required: true, options: deptOptions }, { name: 'level', label: 'Level', type: 'number', required: true }]}
    columns={[{ key: 'code', header: 'Code' }, { key: 'title', header: 'Title' }, { key: 'd', header: 'Department', render: (r) => r.departments?.name }, { key: 'level', header: 'Level' }]} />
)

export const AcademicSessions = () => (
  <CrudPage title="Academic sessions" description="Sessions are configurable; mark one as current. Semesters are FIRST and SECOND." noun="session" table="academic_sessions" order="name"
    fields={[{ name: 'name', label: 'Name (e.g. 2025/2026)', required: true }, { name: 'starts_on', label: 'Starts on', type: 'date' }, { name: 'ends_on', label: 'Ends on', type: 'date' }, { name: 'is_current', label: 'Current session', type: 'checkbox' }]}
    columns={[{ key: 'name', header: 'Session' }, { key: 'starts_on', header: 'Starts' }, { key: 'ends_on', header: 'Ends' }, { key: 'c', header: 'Current', render: (r) => (r.is_current ? <Badge variant="success">Current</Badge> : '—') }]} />
)
