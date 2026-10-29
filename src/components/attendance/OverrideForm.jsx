import { useState } from 'react'
import { toast } from 'sonner'
import Button from '../ui/Button'
import Input, { Select, Textarea } from '../ui/Input'
import StudentAvatar from '../ui/StudentAvatar'
import { StatusBadge } from '../ui/Badge'
import { rpc } from '../../services/api'
import { friendlyError, RESULT_MESSAGES } from '../../lib/errors'

export const OVERRIDE_REASONS = { FINGERPRINT_FAILED: 'Fingerprint failed', FINGER_INJURY: 'Finger injury', SCANNER_PROBLEM: 'Scanner problem', OTHER: 'Other' }

/**
 * Look up by matric number, show identity, require physical verification, then approve ONE attendance event.
 * `onDone(result)` receives the server result. Used by the attendance station and the override approvals page.
 */
export default function OverrideForm({ sessionId, initialMatric = '', onDone, onCancel }) {
  const [matric, setMatric] = useState(initialMatric)
  const [found, setFound] = useState(null)
  const [verified, setVerified] = useState(false)
  const [reason, setReason] = useState('FINGERPRINT_FAILED')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const lookup = async (e) => {
    e?.preventDefault(); setBusy(true); setError(null); setFound(null); setVerified(false)
    try {
      const r = await rpc('lookup_student_for_session', { p_session: sessionId, p_matric: matric })
      if (!r.found) onDone?.({ ok: false, code: 'STUDENT_NOT_FOUND' }); else setFound(r)
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }
  const action = found?.signed_in ? 'SIGN_OUT' : 'SIGN_IN'
  const approve = async () => {
    setBusy(true); setError(null)
    try {
      const r = await rpc('override_attendance', { p_session: sessionId, p_matric: found.student.matric_number, p_action: action, p_reason: reason, p_notes: notes || null })
      if (r.ok) toast.success('Override approved'); onDone?.(r)
    } catch (err) { setError(friendlyError(err)) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-4">
      <form onSubmit={lookup} className="flex items-end gap-2"><div className="flex-1"><Input label="Matric number" required autoCapitalize="characters" value={matric} onChange={(e) => { setMatric(e.target.value); setFound(null) }} /></div><Button type="submit" loading={busy && !found}>Find</Button></form>
      {found && (
        <div className="space-y-4 rounded-xl border border-border p-4">
          <div className="flex items-center gap-4"><StudentAvatar path={found.student.passport_path} name={found.student.full_name} className="h-20 w-20" />
            <div><p className="text-lg font-semibold">{found.student.full_name}</p><p className="text-sm text-text-secondary">{found.student.matric_number} · Level {found.student.level}</p><div className="mt-1 flex gap-2"><StatusBadge status={found.student.biometric_status} />{!found.enrolled_in_class && <StatusBadge status="ABSENT" />}</div></div></div>
          {!found.enrolled_in_class ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{RESULT_MESSAGES.NOT_ENROLLED.message}</p> : found.signed_out ? <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">{RESULT_MESSAGES.ALREADY_COMPLETE.message}</p> : (<>
            <p className="text-sm">Action to approve: <strong>{action === 'SIGN_IN' ? 'Sign in' : 'Sign out'}</strong> (this one event only)</p>
            <Select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>{Object.entries(OVERRIDE_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
            <Textarea label="Notes" required={reason === 'OTHER'} value={notes} onChange={(e) => setNotes(e.target.value)} hint="Optional unless the reason is Other." />
            <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={verified} onChange={(e) => setVerified(e.target.checked)} />I have physically verified this student's identity.</label>
            <Button className="w-full" disabled={!verified} loading={busy} onClick={approve}>Approve {action === 'SIGN_IN' ? 'sign-in' : 'sign-out'}</Button></>)}
        </div>)}
      {error && <p role="alert" className="text-sm text-error">{error}</p>}
      {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
    </div>
  )
}
