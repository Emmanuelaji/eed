import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CheckCircle2, Fingerprint, Info, UserPlus, XCircle, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { clsx } from 'clsx'
import Logo from '../../components/ui/Logo'
import Button from '../../components/ui/Button'
import Input from '../../components/ui/Input'
import { StatusBadge } from '../../components/ui/Badge'
import { Spinner } from '../../components/ui/States'
import StudentAvatar from '../../components/ui/StudentAvatar'
import OverrideForm from '../../components/attendance/OverrideForm'
import MockScannerPanel from '../../components/attendance/MockScannerPanel'
import { db, rpc, run } from '../../services/api'
import { getBiometricAdapter } from '../../services/biometric'
import { useRealtime } from '../../hooks/useRealtime'
import { useAuth } from '../../context/AuthContext'
import { formatDate, formatTime, formatTimeSeconds } from '../../lib/time'
import { formatDuration, sessionPhase } from '../../lib/attendance'
import { friendlyError, RESULT_MESSAGES } from '../../lib/errors'

const TONES = { success: ['bg-green-50 border-green-300', CheckCircle2, 'text-success'], info: ['bg-sky-50 border-sky-300', Info, 'text-sky-700'], warning: ['bg-amber-50 border-amber-300', AlertTriangle, 'text-warning'], error: ['bg-red-50 border-red-300', XCircle, 'text-error'] }
const RESET_MS = 7000
const FAILS_BEFORE_FALLBACK = 3

/**
 * Attendance station state machine.
 * view: idle | scanning | result | matric | enroll | override
 */
export default function Scanner() {
  const { sessionId } = useParams()
  const { role } = useAuth(); const area = role === 'LECTURER' ? '/lecturer' : '/admin'
  const [adapter] = useState(() => { try { return getBiometricAdapter() } catch (e) { return { error: e.message } } })
  const [session, setSession] = useState(null); const [loadErr, setLoadErr] = useState(null)
  const [device, setDevice] = useState(null)
  const [view, setView] = useState('idle')
  const [mode, setMode] = useState('AUTO')
  const [result, setResult] = useState(null)
  const [fails, setFails] = useState(0)
  const [matric, setMatric] = useState(''); const [found, setFound] = useState(null)
  const [verified, setVerified] = useState(false); const [consent, setConsent] = useState(false); const [busy, setBusy] = useState(false)
  const abortRef = useRef(null); const resetTimer = useRef(null)

  const loadSession = useCallback(async () => {
    try {
      await rpc('reconcile_sessions')
      const { data } = await run(db().from('class_sessions').select('*, courses(code,title)').eq('id', sessionId).maybeSingle())
      if (!data) setLoadErr('Class not found, or you are not authorised to run this station.'); else { setSession(data); setLoadErr(null) }
    } catch (e) { setLoadErr(friendlyError(e)) }
  }, [sessionId])
  useEffect(() => { loadSession() }, [loadSession])
  useEffect(() => { if (session) setMode((m) => (m === 'AUTO' ? session.kiosk_mode : m)) }, [session?.id]) // eslint-disable-line
  const live = useRealtime(['class_sessions'], loadSession, { filter: `id=eq.${sessionId}` })

  const checkDevice = useCallback(async () => { if (adapter.error) return setDevice({ connected: false, message: adapter.error }); setDevice(await adapter.getDeviceStatus()) }, [adapter])
  useEffect(() => { checkDevice(); const t = setInterval(checkDevice, 10000); return () => clearInterval(t) }, [checkDevice])

  const goIdle = useCallback(() => { clearTimeout(resetTimer.current); setResult(null); setFound(null); setMatric(''); setVerified(false); setConsent(false); setView('idle') }, [])
  const showResult = (r, autoReset = true) => { setResult(r); setView('result'); clearTimeout(resetTimer.current); if (autoReset) resetTimer.current = setTimeout(goIdle, RESET_MS) }
  useEffect(() => () => { clearTimeout(resetTimer.current); abortRef.current?.abort() }, [])

  // ---- fingerprint listening loop: runs while idle and the device is connected ----
  useEffect(() => {
    if (view !== 'idle' || !device?.connected || !session || adapter.error) return undefined
    const ctrl = new AbortController(); abortRef.current = ctrl
    let cancelled = false
    ;(async () => {
      try {
        setView('idle')
        const id = await adapter.identify({ signal: ctrl.signal })
        if (cancelled) return
        if (!id.success) {
          if (id.code === 'DEVICE_ERROR') { setDevice({ connected: false, message: id.message || 'Scanner error' }); return }
          setFails((n) => n + 1); showResult({ ok: false, code: 'FINGERPRINT_NOT_RECOGNIZED' }, false); return
        }
        setView('scanning')
        const r = await rpc('scan_attendance', { p_session: sessionId, p_template_ref: id.templateReference, p_mode: mode })
        if (cancelled) return
        if (r.ok) setFails(0); else if (r.code === 'FINGERPRINT_NOT_RECOGNIZED') setFails((n) => n + 1)
        showResult(r, r.code !== 'FINGERPRINT_NOT_RECOGNIZED'); loadSession()
      } catch (e) { if (e.name !== 'AbortError' && !cancelled) { toast.error(friendlyError(e)); setView('idle') } }
    })()
    return () => { cancelled = true; ctrl.abort() }
  }, [view, device?.connected, session?.id, mode]) // eslint-disable-line

  const lookup = async (e) => {
    e.preventDefault(); setBusy(true)
    try {
      const r = await rpc('lookup_student_for_session', { p_session: sessionId, p_matric: matric })
      if (!r.found) showResult({ ok: false, code: 'STUDENT_NOT_FOUND' }); else { setFound(r); setVerified(false); setConsent(false); setView('enroll') }
    } catch (err) { toast.error(friendlyError(err)) } finally { setBusy(false) }
  }
  const enrolAndAttend = async () => {
    setBusy(true)
    try {
      const cap = await adapter.enroll(found.student.matric_number)
      if (!cap.success) { showResult({ ok: false, code: 'ENROLLMENT_FAILED', message: cap.message }); return }
      const r = await rpc('enroll_and_attend', { p_session: sessionId, p_matric: found.student.matric_number, p_template_ref: cap.templateReference, p_provider: cap.provider || adapter.mode, p_consent: consent, p_mode: 'SIGN_IN' })
      if (r.ok) { toast.success('Fingerprint enrolled'); showResult({ ...(r.attendance || {}), enrolled: true, student: r.attendance?.student || found.student, enrolledOnly: !r.attendance?.ok }) }
      else showResult(r)
    } catch (err) { toast.error(friendlyError(err)) } finally { setBusy(false) }
  }

  if (adapter.error) return <Centered><p role="alert" className="text-error">{adapter.error}</p></Centered>
  if (loadErr) return <Centered><p role="alert">{loadErr}</p><Link to="/scanner" className="btn-outline btn-md mt-4">Back</Link></Centered>
  if (!session) return <Centered><Spinner /></Centered>

  const phase = sessionPhase(session)
  const accepting = ['OPEN', 'REOPENED'].includes(session.status) && new Date(session.auto_close_at) > new Date()
  const closed = ['AUTO_CLOSED', 'CLOSED', 'CANCELLED'].includes(session.status) || (session.status !== 'SCHEDULED' && !accepting)
  const connected = device?.connected

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex items-center justify-between bg-primary px-4 py-3 text-white">
        <Logo light withText size={36} />
        <div className="flex items-center gap-2"><span className={clsx('badge', live === 'live' ? 'bg-white/20 text-white' : 'bg-amber-200 text-amber-900')}>{live === 'live' ? 'Online' : 'Reconnecting…'}</span>
          <Link to={`${area}/classes/${sessionId}`} className="rounded-lg p-2 hover:bg-white/10" aria-label="Exit station"><ArrowLeft className="h-5 w-5" /></Link></div>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 p-4">
        <section className="card mb-4 p-4" aria-label="Current class">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-lg font-bold">{session.courses?.code} — {session.courses?.title}</p><p className="text-sm text-text-secondary">{formatDate(session.scheduled_start)} · {formatTime(session.scheduled_start)} – {formatTime(session.scheduled_end)} · closes {formatTime(session.auto_close_at)}</p></div><StatusBadge status={session.status} /></div>
          <div className="mt-3 flex items-center gap-2 text-sm"><span className="text-text-secondary">Mode:</span>
            {['AUTO', 'SIGN_IN', 'SIGN_OUT'].map((m) => <button key={m} onClick={() => setMode(m)} aria-pressed={mode === m} className={clsx('rounded-full px-3 py-1 text-xs font-medium', mode === m ? 'bg-primary text-white' : 'bg-mint text-primary')}>{m === 'AUTO' ? 'Auto' : m === 'SIGN_IN' ? 'Sign-in' : 'Sign-out'}</button>)}</div>
        </section>

        {closed && view !== 'result' && <Banner tone="error" title={session.status === 'CANCELLED' ? 'Class cancelled' : 'Class is closed'}>{phase === 'AUTO_CLOSED' ? 'The class was closed automatically at its deadline. An authorised person must reopen it.' : 'Attendance is closed.'} <Link className="underline" to={`${area}/classes/${sessionId}`}>Open class control</Link></Banner>}
        {session.status === 'SCHEDULED' && view !== 'result' && <Banner tone="warning" title="Class has not started">Start the class from class control to accept attendance. <Link className="underline" to={`${area}/classes/${sessionId}`}>Open class control</Link></Banner>}
        {!connected && view !== 'result' && <Banner tone="error" title="Scanner disconnected">{device?.message || 'The fingerprint scanner is not available.'} <button className="underline" onClick={checkDevice}>Retry</button>. You can still use a matric number below.</Banner>}

        {view === 'result' && result && <ResultCard result={result} onDone={goIdle} onRetry={() => { setView('idle') }} fails={fails} onMatric={() => { setView('matric') }} onEnroll={() => setView('matric')} />}

        {(view === 'idle' || view === 'scanning') && (
          <div className="card flex flex-col items-center p-8 text-center" aria-live="polite">
            <div className={clsx('flex h-36 w-36 items-center justify-center rounded-full', connected && !closed && session.status !== 'SCHEDULED' ? 'bg-mint' : 'bg-gray-100')}>
              <Fingerprint className={clsx('h-20 w-20', connected && !closed ? 'text-primary' : 'text-gray-400', view === 'scanning' && 'animate-pulse')} aria-hidden="true" /></div>
            <p className="mt-4 text-xl font-semibold">{view === 'scanning' ? 'Checking…' : 'Place your finger on the scanner'}</p>
            <p className="mt-1 text-sm text-text-secondary">{connected ? 'Scanner ready' : 'Scanner not connected'}{device?.model ? ` · ${device.model}` : ''}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => setView('matric')}><KeyRound className="h-4 w-4" />Use matric number</Button><Button variant="outline" onClick={() => setView('matric')}><UserPlus className="h-4 w-4" />First time? Enrol</Button></div>
          </div>)}

        {view === 'matric' && (
          <div className="card p-6"><h2 className="text-lg font-semibold">Find student by matric number</h2><p className="mb-3 text-sm text-text-secondary">For first-time fingerprint enrolment, or when a fingerprint fails.</p>
            <form onSubmit={lookup} className="space-y-4"><Input label="Matric number" required autoFocus autoCapitalize="characters" value={matric} onChange={(e) => setMatric(e.target.value)} /><div className="flex gap-2"><Button type="submit" loading={busy}>Find student</Button><Button variant="outline" onClick={goIdle}>Cancel</Button></div></form></div>)}

        {view === 'enroll' && found && (
          <div className="card space-y-4 p-6">
            <div className="flex items-center gap-4"><StudentAvatar path={found.student.passport_path} name={found.student.full_name} className="h-24 w-24" /><div><p className="text-xl font-semibold">{found.student.full_name}</p><p className="text-sm text-text-secondary">{found.student.matric_number} · Level {found.student.level}</p><StatusBadge status={found.student.biometric_status} /></div></div>
            {!found.enrolled_in_class ? <><Banner tone="error" title="Not enrolled in this course">{RESULT_MESSAGES.NOT_ENROLLED.message}</Banner><Button variant="outline" onClick={goIdle}>Back</Button></> : <>
              {found.student.biometric_status !== 'ENROLLED' ? (<div className="space-y-3 rounded-xl bg-mint p-4"><p className="font-medium">First-time fingerprint enrolment</p>
                <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={verified} onChange={(e) => setVerified(e.target.checked)} />I have physically verified this student's identity against the photograph.</label>
                <label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={consent} onChange={(e) => setConsent(e.target.checked)} />The student consents to their fingerprint being enrolled for attendance.</label>
                <Button className="w-full" size="lg" disabled={!verified || !consent || !connected} loading={busy} onClick={enrolAndAttend}><Fingerprint className="h-5 w-5" />Capture fingerprint &amp; sign in</Button>
                {!connected && <p className="text-xs text-error">Scanner must be connected to enrol.</p>}</div>) : <Banner tone="info" title="Already enrolled">This student has an enrolled fingerprint. Use the scanner, or approve an override below if it keeps failing.</Banner>}
              <button className="text-sm text-primary underline" onClick={() => setView('override')}>Fingerprint failing? Approve an override instead</button>
              <div><Button variant="ghost" onClick={goIdle}>Cancel</Button></div></>}
          </div>)}

        {view === 'override' && found && <div className="card p-6"><h2 className="mb-3 text-lg font-semibold">Temporary override</h2><OverrideForm sessionId={sessionId} initialMatric={found.student.matric_number} onDone={(r) => showResult(r.ok ? { ...r, override: true } : r)} onCancel={goIdle} /></div>}

        {adapter.mode === 'mock' && <MockScannerPanel adapter={adapter} />}
      </main>
    </div>
  )
}

const Centered = ({ children }) => <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">{children}</div>

function Banner({ tone, title, children }) {
  const [cls, Icon, ic] = TONES[tone]
  return <div role="alert" className={clsx('mb-4 flex gap-3 rounded-xl border p-4 text-sm', cls)}><Icon className={clsx('mt-0.5 h-5 w-5 shrink-0', ic)} aria-hidden="true" /><div><p className="font-semibold">{title}</p><p>{children}</p></div></div>
}

function ResultCard({ result, onDone, onRetry, fails, onMatric, onEnroll }) {
  const meta = RESULT_MESSAGES[result.code] || { tone: 'error', title: 'Could not record attendance', message: result.code }
  const [cls, Icon, ic] = TONES[meta.tone]
  const st = result.student
  const title = result.enrolledOnly ? 'FINGERPRINT ENROLLED' : meta.title
  return (
    <div className={clsx('rounded-2xl border-2 p-6 text-center', cls)} role="status" aria-live="assertive">
      <Icon className={clsx('mx-auto h-16 w-16', ic)} aria-hidden="true" />
      <h2 className="mt-2 text-2xl font-extrabold">{title}</h2>
      {result.enrolled && <p className="text-sm">Fingerprint enrolled — first-time enrolment complete.</p>}
      {result.override && <p className="mt-1 text-sm font-medium text-amber-800">Approved by staff override (this event only)</p>}
      {st && ['SIGN_IN_SUCCESS', 'SIGN_OUT_SUCCESS', 'ALREADY_SIGNED_IN', 'ALREADY_COMPLETE'].includes(result.code) || result.enrolledOnly ? (
        <div className="mt-4 flex flex-col items-center gap-2"><StudentAvatar path={st?.passport_path} name={st?.full_name} className="h-28 w-28" /><p className="text-xl font-semibold">{st?.full_name}</p><p className="text-text-secondary">{st?.matric_number}</p>
          {result.at && <p className="text-lg">{result.code === 'SIGN_OUT_SUCCESS' ? 'Signed out' : 'Signed in'} at <strong>{formatTimeSeconds(result.at)}</strong></p>}
          {result.status && result.code === 'SIGN_IN_SUCCESS' && <StatusBadge status={result.status} />}
          {result.code === 'SIGN_OUT_SUCCESS' && <p className="text-sm">Time in class: {formatDuration(result.duration_minutes)}</p>}
          {result.code === 'ALREADY_SIGNED_IN' && result.sign_in_at && <p className="text-sm">Signed in at {formatTimeSeconds(result.sign_in_at)}</p>}
          {result.code === 'ALREADY_COMPLETE' && <p className="text-sm">In {formatTimeSeconds(result.sign_in_at)} · Out {formatTimeSeconds(result.sign_out_at)}</p>}
          {result.enrolledOnly && <p className="text-sm">Attendance was not recorded (class not accepting sign-ins).</p>}</div>
      ) : <p className="mt-2">{result.message || meta.message}</p>}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {result.code === 'FINGERPRINT_NOT_RECOGNIZED' && <><Button size="lg" onClick={onRetry}>Try again</Button><Button size="lg" variant="outline" onClick={onEnroll}><UserPlus className="h-4 w-4" />First time? Enrol</Button>{fails >= FAILS_BEFORE_FALLBACK && <Button size="lg" variant="outline" onClick={onMatric}><KeyRound className="h-4 w-4" />Use matric number</Button>}</>}
        <Button variant={result.code === 'FINGERPRINT_NOT_RECOGNIZED' ? 'ghost' : 'primary'} onClick={onDone}>{result.code === 'FINGERPRINT_NOT_RECOGNIZED' ? 'Cancel' : 'Next student'}</Button>
      </div>
    </div>
  )
}
