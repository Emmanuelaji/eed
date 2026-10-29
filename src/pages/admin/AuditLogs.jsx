import { useState } from 'react'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import DataTable, { Pagination } from '../../components/ui/DataTable'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { db, run } from '../../services/api'
import { formatDateTime } from '../../lib/time'

const PAGE = 25
export default function AuditLogs() {
  const [action, setAction] = useState(''); const [page, setPage] = useState(0)
  const q = useQuery(async () => {
    const actors = await run(db().from('profiles').select('id,full_name,email'))
    const map = Object.fromEntries(actors.data.map((a) => [a.id, a.full_name || a.email]))
    let query = db().from('audit_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(page * PAGE, page * PAGE + PAGE - 1)
    if (action.trim()) query = query.ilike('action', `%${action.trim().replace(/[%,()]/g, '')}%`)
    const { data, count } = await run(query)
    return { rows: data.map((r) => ({ ...r, actor: r.actor_id ? map[r.actor_id] || r.actor_id : 'System' })), count }
  }, [action, page])
  return (
    <>
      <PageHeader title="Audit log" description="Append-only. Entries cannot be edited or deleted." />
      <Card><div className="mb-4 max-w-xs"><Input label="Filter by action" placeholder="e.g. CLASS_, OVERRIDE" value={action} onChange={(e) => { setAction(e.target.value); setPage(0) }} /></div>
        <QueryBoundary query={q} isEmpty={(d) => d.rows.length === 0} empty={<EmptyState title="No audit entries" />}>{(d) => (<><DataTable rows={d.rows} columns={[
          { key: 't', header: 'When', render: (r) => formatDateTime(r.created_at) }, { key: 'actor', header: 'Actor' }, { key: 'action', header: 'Action', render: (r) => <span className="font-mono text-xs">{r.action}</span> },
          { key: 'e', header: 'Entity', render: (r) => `${r.entity_type}${r.entity_id ? ` · ${String(r.entity_id).slice(0, 8)}` : ''}` }, { key: 'reason', header: 'Reason' },
          { key: 'm', header: 'Details', render: (r) => <span className="break-all font-mono text-xs text-text-secondary">{Object.keys(r.metadata || {}).length ? JSON.stringify(r.metadata) : ''}</span> }]} />
          <Pagination page={page} pageSize={PAGE} total={d.count || 0} onPage={setPage} /></>)}</QueryBoundary></Card>
    </>
  )
}
