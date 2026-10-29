import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card, CardTitle } from '../../components/ui/Card'
import Input from '../../components/ui/Input'
import Button from '../../components/ui/Button'
import { QueryBoundary } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { db, run } from '../../services/api'
import { friendlyError } from '../../lib/errors'
import { getBiometricAdapter } from '../../services/biometric'
import { TZ } from '../../lib/time'

const FIELDS = [['institution_name', 'Institution name', 'text'], ['late_after_minutes', 'Default: minutes after start before "Late"', 'number'], ['default_early_signin_minutes', 'Default early sign-in window (minutes)', 'number'], ['default_auto_close_grace_minutes', 'Default auto-close grace after scheduled end (minutes)', 'number']]

export default function Settings() {
  const q = useQuery(async () => Object.fromEntries((await run(db().from('app_settings').select('key,value'))).data.map((r) => [r.key, r.value])), [])
  const [v, setV] = useState({}); const [busy, setBusy] = useState(false)
  useEffect(() => { if (q.data) setV(q.data) }, [q.data])
  let mode = 'unavailable'; try { mode = getBiometricAdapter().mode } catch (e) { mode = e.message }
  const save = async () => {
    setBusy(true)
    try { for (const [k, , t] of FIELDS) await run(db().from('app_settings').upsert({ key: k, value: t === 'number' ? Number(v[k]) : String(v[k]), updated_at: new Date().toISOString() })); toast.success('Settings saved') }
    catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <>
      <PageHeader title="Settings" description="Defaults applied when creating new class sessions." />
      <QueryBoundary query={q}>{() => (<div className="grid max-w-3xl gap-6">
        <Card><CardTitle>Attendance defaults</CardTitle><div className="mt-4 grid gap-4 sm:grid-cols-2">{FIELDS.map(([k, l, t]) => <Input key={k} label={l} type={t} min={t === 'number' ? 0 : undefined} value={v[k] ?? ''} onChange={(e) => setV({ ...v, [k]: e.target.value })} />)}</div><Button className="mt-4" loading={busy} onClick={save}>Save settings</Button></Card>
        <Card><CardTitle>System</CardTitle><dl className="mt-3 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-text-secondary">Timezone</dt><dd>{TZ}</dd></div><div className="flex justify-between"><dt className="text-text-secondary">Biometric adapter</dt><dd className="font-mono">{mode}</dd></div></dl></Card></div>)}</QueryBoundary>
    </>
  )
}
