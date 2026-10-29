import { useEffect, useState } from 'react'
import { FlaskConical } from 'lucide-react'
import Button from '../ui/Button'

/** Visible ONLY with the mock adapter. Lets a developer pretend to place a finger. Never real biometrics. */
export default function MockScannerPanel({ adapter }) {
  const [, force] = useState(0)
  const [sel, setSel] = useState('')
  useEffect(() => adapter.subscribe(() => force((x) => x + 1)), [adapter])
  const fingers = adapter.listEnrolled()
  return (
    <section className="mt-6 rounded-xl border-2 border-dashed border-warning bg-amber-50 p-4 text-left" aria-label="Development mock scanner">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-800"><FlaskConical className="h-4 w-4" />DEVELOPMENT MOCK SCANNER — not real biometrics</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[12rem] flex-1 text-sm">Finger to place
          <select className="input mt-1" value={sel} onChange={(e) => setSel(e.target.value)}><option value="">Select an enrolled mock finger…</option>{fingers.map((f) => <option key={f.templateRef} value={f.templateRef}>{f.label}</option>)}</select></label>
        <Button size="sm" disabled={!sel} onClick={() => adapter.placeFinger(sel)}>Place finger</Button>
        <Button size="sm" variant="outline" onClick={() => adapter.placeFinger(null)}>Unknown finger</Button>
        <Button size="sm" variant="outline" onClick={() => adapter.simulateError()}>Scanner error</Button>
        <Button size="sm" variant="outline" onClick={() => adapter.setConnected(!adapter.connected)}>{adapter.connected ? 'Disconnect' : 'Reconnect'}</Button>
      </div>
      {fingers.length === 0 && <p className="mt-2 text-xs text-amber-800">No mock fingers yet. Enrol a student (matric number → Enrol fingerprint) and it will appear here.</p>}
    </section>
  )
}
