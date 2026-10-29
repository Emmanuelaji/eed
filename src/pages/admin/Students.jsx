import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Input, { Select } from '../../components/ui/Input'
import DataTable, { Pagination } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/Badge'
import StudentAvatar from '../../components/ui/StudentAvatar'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useBase } from '../../hooks/useBase'
import { db, run } from '../../services/api'

const PAGE = 15
export default function Students() {
  const nav = useNavigate(); const base = useBase()
  const [q, setQ] = useState(''); const [dept, setDept] = useState(''); const [level, setLevel] = useState(''); const [bio, setBio] = useState(''); const [page, setPage] = useState(0)
  const depts = useQuery(async () => (await run(db().from('departments').select('id,name').order('name'))).data, [])
  const res = useQuery(async () => {
    let query = db().from('students').select('id,matric_number,full_name,passport_path,level,registration_status,biometric_status,departments(name)', { count: 'exact' }).order('full_name').range(page * PAGE, page * PAGE + PAGE - 1)
    const term = q.trim().replace(/[%,()]/g, '')
    if (term) query = query.or(`full_name.ilike.%${term}%,matric_number.ilike.%${term}%`)
    if (dept) query = query.eq('department_id', dept)
    if (level) query = query.eq('level', Number(level))
    if (bio) query = query.eq('biometric_status', bio)
    const { data, count } = await run(query)
    return { rows: data, count }
  }, [q, dept, level, bio, page])
  const reset = (fn) => (e) => { fn(e.target.value); setPage(0) }
  return (
    <>
      <PageHeader title="Students" description="One record per person; course enrolments are tracked separately." />
      <Card>
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative"><Search className="absolute left-3 top-9 h-4 w-4 text-text-secondary" aria-hidden="true" /><Input label="Search" className="pl-9" placeholder="Name or matric number" value={q} onChange={reset(setQ)} /></div>
          <Select label="Department" value={dept} onChange={reset(setDept)}><option value="">All</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          <Select label="Level" value={level} onChange={reset(setLevel)}><option value="">All</option>{[100, 200, 300, 400, 500].map((l) => <option key={l}>{l}</option>)}</Select>
          <Select label="Biometric" value={bio} onChange={reset(setBio)}><option value="">All</option><option value="ENROLLED">Enrolled</option><option value="NOT_ENROLLED">Not enrolled</option><option value="REVOKED">Revoked</option></Select>
        </div>
        <QueryBoundary query={res} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No students found" message="Students appear here after they register through a registration link." />}>
          {(d) => (<>
            <DataTable caption="Students" rows={d.rows} onRowClick={(r) => nav(`${base}/students/${r.id}`)} columns={[
              { key: 'p', header: 'Photo', render: (r) => <StudentAvatar path={r.passport_path} name={r.full_name} />, hideOnMobile: true },
              { key: 'full_name', header: 'Name', render: (r) => <Link to={`${base}/students/${r.id}`} className="font-medium text-primary hover:underline">{r.full_name}</Link> },
              { key: 'matric_number', header: 'Matric no.' },
              { key: 'dept', header: 'Department', render: (r) => r.departments?.name },
              { key: 'level', header: 'Level' },
              { key: 'registration_status', header: 'Status', render: (r) => <StatusBadge status={r.registration_status} /> },
              { key: 'biometric_status', header: 'Biometric', render: (r) => <StatusBadge status={r.biometric_status} /> },
            ]} />
            <Pagination page={page} pageSize={PAGE} total={d.count || 0} onPage={setPage} />
          </>)}
        </QueryBoundary>
      </Card>
    </>
  )
}
