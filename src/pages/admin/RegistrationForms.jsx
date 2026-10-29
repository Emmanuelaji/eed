import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Copy, ExternalLink, Plus, QrCode, Share2, Download, Printer } from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'
import { toast } from 'sonner'
import PageHeader from '../../components/ui/PageHeader'
import { Card } from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Modal from '../../components/ui/Modal'
import Badge from '../../components/ui/Badge'
import DataTable from '../../components/ui/DataTable'
import { QueryBoundary, EmptyState } from '../../components/ui/States'
import { useQuery } from '../../hooks/useQuery'
import { db, run } from '../../services/api'
import { registrationUrl } from '../../services/registrationService'
import { formatDateTime } from '../../lib/time'
import { friendlyError } from '../../lib/errors'

export const formState = (f) => (!f.is_active ? ['neutral', 'Inactive'] : f.deadline && new Date(f.deadline) < new Date() ? ['warning', 'Expired'] : f.max_registrations && f.registrations >= f.max_registrations ? ['warning', 'Full'] : ['success', 'Open'])

export default function RegistrationForms() {
  const q = useQuery(async () => {
    const { data } = await run(db().from('registration_forms').select('*, courses(code,title), student_course_enrollments(count)').order('created_at', { ascending: false }))
    return data.map((f) => ({ ...f, registrations: f.student_course_enrollments?.[0]?.count ?? 0 }))
  }, [])
  const [qr, setQr] = useState(null)

  const copy = async (f) => { try { await navigator.clipboard.writeText(registrationUrl(f.token)); toast.success('Link copied') } catch { toast.error('Could not copy — select the link in the QR dialog instead') } }
  const share = async (f) => { if (navigator.share) { try { await navigator.share({ title: f.name, url: registrationUrl(f.token) }) } catch { /* cancelled */ } } else copy(f) }
  const toggle = async (f) => {
    try { await run(db().from('registration_forms').update({ is_active: !f.is_active }).eq('id', f.id)); toast.success(f.is_active ? 'Form deactivated' : 'Form activated'); q.reload({ silent: true }) }
    catch (e) { toast.error(friendlyError(e)) }
  }
  const downloadQr = () => {
    const svg = document.getElementById('qr-svg'); if (!svg) return
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `eed-registration-${qr.token}.svg` }); a.click(); URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader title="Registration forms" description="Each form has its own unpredictable public link." actions={<Link to="/admin/registration-forms/new" className="btn-primary btn-md"><Plus className="h-4 w-4" />New form</Link>} />
      <Card>
        <QueryBoundary query={q} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No registration forms" message="Create a form to get a link students can use to register." action={<Link to="/admin/registration-forms/new" className="btn-primary btn-md mt-2">Create form</Link>} />}>
          {(rows) => <DataTable rows={rows} columns={[
            { key: 'name', header: 'Form', render: (f) => <Link className="font-medium text-primary hover:underline" to={`/admin/registration-forms/${f.id}`}>{f.name}</Link> },
            { key: 'c', header: 'Course', render: (f) => f.courses?.code },
            { key: 'r', header: 'Registrations', render: (f) => `${f.registrations}${f.max_registrations ? ` / ${f.max_registrations}` : ''}` },
            { key: 'd', header: 'Deadline', render: (f) => (f.deadline ? formatDateTime(f.deadline) : 'None') },
            { key: 's', header: 'Status', render: (f) => { const [v, l] = formState(f); return <Badge variant={v}>{l}</Badge> } },
            { key: 'a', header: 'Actions', render: (f) => (
              <div className="flex flex-wrap justify-end gap-1">
                <Button size="sm" variant="ghost" onClick={() => copy(f)} aria-label="Copy link"><Copy className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" onClick={() => setQr(f)} aria-label="Show QR code"><QrCode className="h-4 w-4" /></Button>
                <a className="btn-ghost btn-sm" href={registrationUrl(f.token)} target="_blank" rel="noreferrer" aria-label="Open form"><ExternalLink className="h-4 w-4" /></a>
                <Button size="sm" variant="outline" onClick={() => toggle(f)}>{f.is_active ? 'Deactivate' : 'Activate'}</Button>
              </div>) },
          ]} />}
        </QueryBoundary>
      </Card>
      <Modal open={!!qr} onClose={() => setQr(null)} title={qr?.name || ''} footer={<><Button variant="outline" onClick={() => share(qr)}><Share2 className="h-4 w-4" />Share</Button><Button variant="outline" onClick={downloadQr}><Download className="h-4 w-4" />Download</Button><Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print</Button></>}>
        {qr && <div className="flex flex-col items-center gap-3 text-center"><QRCodeSVG id="qr-svg" value={registrationUrl(qr.token)} size={220} marginSize={2} /><p className="break-all font-mono text-xs">{registrationUrl(qr.token)}</p></div>}
      </Modal>
    </>
  )
}
