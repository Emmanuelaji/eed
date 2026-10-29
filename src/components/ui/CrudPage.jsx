import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import PageHeader from './PageHeader'
import { Card } from './Card'
import Button from './Button'
import Modal, { ConfirmDialog } from './Modal'
import Input, { Select } from './Input'
import DataTable from './DataTable'
import { QueryBoundary, EmptyState } from './States'
import { useQuery } from '../../hooks/useQuery'
import { useAuth } from '../../context/AuthContext'
import { db, run } from '../../services/api'
import { friendlyError } from '../../lib/errors'

/**
 * Config-driven list + create/edit/delete page for simple reference tables.
 * fields: [{ name, label, type: 'text'|'number'|'date'|'checkbox'|'select', required, options: async () => [{value,label}] }]
 */
export default function CrudPage({ title, description, table, select = '*', order = 'created_at', fields, columns, noun }) {
  const { role } = useAuth(); const canEdit = role === 'ADMIN'
  const q = useQuery(async () => (await run(db().from(table).select(select).order(order))).data, [table])
  const opts = useQuery(async () => {
    const out = {}
    for (const f of fields) if (f.options) out[f.name] = await f.options()
    return out
  }, [table])
  const [edit, setEdit] = useState(null); const [del, setDel] = useState(null); const [busy, setBusy] = useState(false); const [errs, setErrs] = useState({})

  const blank = () => Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : '']))
  const submit = async () => {
    const e = {}; fields.forEach((f) => { if (f.required && !String(edit[f.name] ?? '').trim()) e[f.name] = 'Required' }); setErrs(e)
    if (Object.keys(e).length) return
    const row = Object.fromEntries(fields.map((f) => [f.name, f.type === 'number' ? Number(edit[f.name]) : f.type === 'checkbox' ? Boolean(edit[f.name]) : (edit[f.name] === '' ? null : typeof edit[f.name] === 'string' ? edit[f.name].trim() : edit[f.name])]))
    setBusy(true)
    try {
      if (edit.id) await run(db().from(table).update(row).eq('id', edit.id)); else await run(db().from(table).insert(row))
      toast.success('Saved'); setEdit(null); q.reload({ silent: true })
    } catch (x) { toast.error(friendlyError(x)) } finally { setBusy(false) }
  }
  const remove = async () => {
    setBusy(true)
    try { await run(db().from(table).delete().eq('id', del.id)); toast.success('Deleted'); setDel(null); q.reload({ silent: true }) }
    catch (x) { toast.error(friendlyError(x)); setDel(null) } finally { setBusy(false) }
  }
  const cols = [...columns, ...(canEdit ? [{ key: '_a', header: '', render: (r) => (
    <div className="flex justify-end gap-1"><Button size="sm" variant="ghost" aria-label="Edit" onClick={() => { setErrs({}); setEdit({ ...blank(), ...Object.fromEntries(fields.map((f) => [f.name, r[f.name] ?? (f.type === 'checkbox' ? false : '')])), id: r.id }) }}><Pencil className="h-4 w-4" /></Button>
      <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => setDel(r)}><Trash2 className="h-4 w-4 text-error" /></Button></div>) }] : [])]
  return (
    <>
      <PageHeader title={title} description={description} actions={canEdit && <Button onClick={() => { setErrs({}); setEdit(blank()) }}><Plus className="h-4 w-4" />Add {noun}</Button>} />
      <Card>
        <QueryBoundary query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title={`No ${noun}s yet`} message={canEdit ? `Add your first ${noun}.` : undefined} />}>{(rows) => <DataTable rows={rows} columns={cols} caption={title} />}</QueryBoundary>
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? `Edit ${noun}` : `Add ${noun}`} footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}>
        {edit && <div className="space-y-4">{fields.map((f) => f.type === 'select'
          ? <Select key={f.name} label={f.label} required={f.required} value={edit[f.name]} error={errs[f.name]} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })}><option value="">Select…</option>{(opts.data?.[f.name] || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</Select>
          : f.type === 'checkbox'
            ? <label key={f.name} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={edit[f.name]} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.checked })} />{f.label}</label>
            : <Input key={f.name} label={f.label} type={f.type || 'text'} required={f.required} value={edit[f.name] ?? ''} error={errs[f.name]} onChange={(e) => setEdit({ ...edit, [f.name]: e.target.value })} />)}</div>}
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} onConfirm={remove} loading={busy} danger confirmLabel="Delete" title={`Delete ${noun}?`} message="This cannot be undone. Records that still use it will block deletion." />
    </>
  )
}
