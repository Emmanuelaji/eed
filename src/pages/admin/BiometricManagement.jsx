import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import DataTable, { Pagination } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/Badge'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import BiometricActions from '../../components/attendance/BiometricActions'
import { useQuery } from '../../hooks/useQuery'
import { db, run } from '../../services/api'

const PAGE = 15
export default function BiometricManagement() {
  const [bio, setBio] = useState('NOT_ENROLLED'); const [page, setPage] = useState(0)
  const q = useQuery(async () => {
    let query = db().from('students').select('id,matric_number,full_name,biometric_status', { count: 'exact' }).order('full_name').range(page * PAGE, page * PAGE + PAGE - 1)
    if (bio) query = query.eq('biometric_status', bio)
    const { data, count } = await run(query); return { rows: data, count }
  }, [bio, page])
  const stats = useQuery(async () => { const c = async (s) => (await run(db().from('students').select('id', { count: 'exact', head: true }).eq('biometric_status', s))).count; return { e: await c('ENROLLED'), n: await c('NOT_ENROLLED'), r: await c('REVOKED') } }, [q.data])
  return (
    <>
      <PageHeader title="Biometric enrolment" description="Enrol, re-enrol or remove fingerprints. Only opaque scanner references are stored." />
      {stats.data && <p className="mb-4 text-sm text-text-secondary">Enrolled: <strong>{stats.data.e}</strong> · Not enrolled: <strong>{stats.data.n}</strong> · Revoked: <strong>{stats.data.r}</strong></p>}
      <Card><div className="mb-4 max-w-xs"><Select label="Status" value={bio} onChange={(e) => { setBio(e.target.value); setPage(0) }}><option value="">All</option><option value="NOT_ENROLLED">Not enrolled</option><option value="ENROLLED">Enrolled</option><option value="REVOKED">Revoked</option></Select></div>
        <QueryBoundary query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No students in this state" />}>{(d) => (<><DataTable rows={d.rows} columns={[
          { key: 'm', header: 'Matric', render: (r) => r.matric_number }, { key: 'n', header: 'Name', render: (r) => r.full_name }, { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.biometric_status} /> },
          { key: 'a', header: 'Actions', render: (r) => <BiometricActions student={r} onChanged={() => q.reload({ silent: true })} /> }]} /><Pagination page={page} pageSize={PAGE} total={d.count || 0} onPage={setPage} /></>)}</QueryBoundary></Card>
    </>
  )
}
