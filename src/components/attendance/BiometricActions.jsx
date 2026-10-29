import { useState } from 'react'
import { Fingerprint, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import Button from '../ui/Button'
import Modal, { ConfirmDialog } from '../ui/Modal'
import { Textarea } from '../ui/Input'
import { StatusBadge } from '../ui/Badge'
import { rpc } from '../../services/api'
import { getBiometricAdapter } from '../../services/biometric'
import { friendlyError, RESULT_MESSAGES } from '../../lib/errors'

/** Admin enrol / re-enrol / revoke using the configured biometric adapter. */
export default function BiometricActions({ student, onChanged }) {
  const [consentOpen, setConsentOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const enroll = async () => {
    setBusy(true)
    try {
      const adapter = getBiometricAdapter()
      const dev = await adapter.getDeviceStatus()
      if (!dev.connected) throw new Error(dev.message || 'Scanner not connected')
      const cap = await adapter.enroll(student.matric_number)
      if (!cap.success) throw new Error(cap.message || 'Fingerprint capture failed')
      const res = await rpc('admin_enroll_biometric', { p_student: student.id, p_template_ref: cap.templateReference, p_provider: cap.provider || adapter.mode, p_consent: consent })
      if (!res.ok) throw new Error(RESULT_MESSAGES[res.code]?.message || res.code)
      toast.success('Fingerprint enrolled'); setConsentOpen(false); setConsent(false); onChanged?.()
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  const revoke = async () => {
    setBusy(true)
    try {
      const res = await rpc('admin_revoke_biometric', { p_student: student.id, p_reason: reason })
      if (!res.ok) throw new Error('A reason (at least 3 characters) is required')
      await getBiometricAdapter().remove(student.matric_number)
      toast.success('Biometric enrolment removed'); setRevokeOpen(false); setReason(''); onChanged?.()
    } catch (e) { toast.error(friendlyError(e)) } finally { setBusy(false) }
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2 text-sm">Status: <StatusBadge status={student.biometric_status} /></div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setConsentOpen(true)}><Fingerprint className="h-4 w-4" />{student.biometric_status === 'ENROLLED' ? 'Re-enrol' : 'Enrol fingerprint'}</Button>
        {student.biometric_status === 'ENROLLED' && <Button size="sm" variant="danger" onClick={() => setRevokeOpen(true)}><Trash2 className="h-4 w-4" />Remove</Button>}
      </div>
      <Modal open={consentOpen} onClose={() => setConsentOpen(false)} title="Enrol fingerprint"
        footer={<><Button variant="outline" onClick={() => setConsentOpen(false)}>Cancel</Button><Button loading={busy} disabled={!consent} onClick={enroll}>Start capture</Button></>}>
        <p className="text-sm">Student: <strong>{student.full_name}</strong> ({student.matric_number}). Confirm the student's identity in person first.</p>
        <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />The student has consented to biometric enrolment.</label>
      </Modal>
      <ConfirmDialog open={revokeOpen} onClose={() => setRevokeOpen(false)} onConfirm={revoke} loading={busy} danger confirmLabel="Remove enrolment" title="Remove fingerprint enrolment"
        message={<span className="block"><span className="mb-2 block">The student will need to enrol again. This is audited.</span><Textarea label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} /></span>} />
    </div>
  )
}
