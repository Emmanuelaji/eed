import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import { Select } from '../../components/ui/Input'
import DataTable, { Pagination } from '../../components/ui/DataTable'
import { StatusBadge } from '../../components/ui/Badge'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { useRealtime } from '../../hooks/useRealtime'
import { useBase } from '../../hooks/useBase'
import { db, rpc, run } from '../../services/api'
import { formatDate, formatTime } from '../../lib/time'

const PAGE = 15
export default function ClassSessions() {
  const base = useBase(); const nav = useNavigate()
  const [status, setStatus] = useState(''); const [page, setPage] = useState(0)
  const q = useQuery(async () => {
    await rpc('reconcile_sessions')
    let query = db().from('class_sessions').select('id,status,scheduled_start,scheduled_end,auto_close_at,venue,semester,courses(code,title),academic_sessions(name)', { count: 'exact' }).order('scheduled_start', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (status) query = query.eq('status', status)
    const { data, count } = await run(query)
    return { rows: data, count }
  }, [status, page])
  useRealtime(['class_sessions'], () => q.reload({ silent: true }))
  return (
    <>
      <PageHeader title="Class sessions" description="Scheduled end time, automatic-close deadline and manual closure are tracked separately."
        actions={<Link to={`${base}/classes/new`} className="btn-primary btn-md"><Plus className="h-4 w-4" />New class</Link>} />
      <Card>
        <div className="mb-4 max-w-xs"><Select label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0) }}><option value="">All</option>{['SCHEDULED', 'OPEN', 'AUTO_CLOSED', 'REOPENED', 'CLOSED', 'CANCELLED'].map((s) => <option key={s}>{s}</option>)}</Select></div>
        <QueryBoundary query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No class sessions" message="Create a class session to start taking attendance." />}>
          {(d) => (<><DataTable rows={d.rows} onRowClick={(r) => nav(`${base}/classes/${r.id}`)} columns={[
            { key: 'c', header: 'Course', render: (r) => <Link className="font-medium text-primary hover:underline" to={`${base}/classes/${r.id}`}>{r.courses?.code} — {r.courses?.title}</Link> },
            { key: 'd', header: 'Date', render: (r) => formatDate(r.scheduled_start) },
            { key: 't', header: 'Scheduled', render: (r) => `${formatTime(r.scheduled_start)} – ${formatTime(r.scheduled_end)}` },
            { key: 'x', header: 'Auto-close', render: (r) => formatTime(r.auto_close_at) },
            { key: 'v', header: 'Venue' }, { key: 's', header: 'Status', render: (r) => <StatusBadge status={r.status} /> }]} />
            <Pagination page={page} pageSize={PAGE} total={d.count || 0} onPage={setPage} /></>)}
        </QueryBoundary>
      </Card>
    </>
  )
}
