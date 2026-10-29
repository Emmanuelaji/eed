import { describe, it, expect, beforeEach } from 'vitest'
import { normalizeMatric, isValidMatric } from '../src/lib/matric'
import { lagosToIso, lagosDateString, lagosTimeString, formatTime, addMinutes, toLagosInput, fromLagosInput } from '../src/lib/time'
import { isAccepting, effectiveStatus, sessionPhase, attendanceStatus, durationMinutes, formatDuration } from '../src/lib/attendance'
import { registrationSchema, validatePhoto, classSessionSchema, MAX_PHOTO_BYTES } from '../src/lib/validation'
import { toCsv } from '../src/lib/csv'
import { friendlyError } from '../src/lib/errors'

describe('matric numbers', () => {
  it('normalises whitespace and case consistently', () => {
    expect(normalizeMatric(' csc / 22 /004 ')).toBe('CSC/22/004')
    expect(normalizeMatric('csc/22/004')).toBe(normalizeMatric('CSC/22/004'))
  })
  it('validates', () => {
    expect(isValidMatric('CSC/22/004')).toBe(true)
    expect(isValidMatric('ab')).toBe(false)
    expect(isValidMatric("x'; drop table students;--")).toBe(false)
  })
})

describe('Africa/Lagos time handling', () => {
  it('converts Lagos wall-clock to UTC (UTC+1, no DST)', () => {
    expect(lagosToIso('2026-03-10', '08:00')).toBe('2026-03-10T07:00:00.000Z')
    expect(lagosToIso('2026-07-10', '08:00')).toBe('2026-07-10T07:00:00.000Z')
  })
  it('00:30 Lagos is the previous day in UTC but still the right Lagos date', () => {
    const iso = lagosToIso('2026-05-02', '00:30')
    expect(iso).toBe('2026-05-01T23:30:00.000Z')
    expect(lagosDateString(iso)).toBe('2026-05-02')
    expect(lagosTimeString(iso)).toBe('00:30')
  })
  it('23:59 Lagos stays on the same Lagos date', () => {
    expect(lagosDateString(lagosToIso('2026-05-02', '23:59'))).toBe('2026-05-02')
  })
  it('round-trips through datetime-local values', () => {
    const iso = lagosToIso('2026-09-01', '12:15')
    expect(toLagosInput(iso)).toBe('2026-09-01T12:15')
    expect(fromLagosInput('2026-09-01T12:15')).toBe(iso)
  })
  it('formats times in Lagos regardless of the machine timezone', () => {
    expect(formatTime('2026-03-10T07:00:00Z').replace(/\s/g, ' ').toLowerCase()).toContain('8:00')
  })
  it('rejects invalid input', () => { expect(() => lagosToIso('nope', '08:00')).toThrow() })
})

// 08:00 start, 12:00 end, 12:15 auto-close (Lagos) on 2026-03-10
const base = { scheduled_start: lagosToIso('2026-03-10', '08:00'), scheduled_end: lagosToIso('2026-03-10', '12:00'), auto_close_at: lagosToIso('2026-03-10', '12:15'), early_signin_minutes: 0 }
const at = (t) => lagosToIso('2026-03-10', t)

describe('class lifecycle rules (client mirror of the database)', () => {
  it('SCHEDULED rejects attendance unless an early window applies', () => {
    expect(isAccepting({ ...base, status: 'SCHEDULED' }, at('07:55'))).toBe(false)
    expect(isAccepting({ ...base, status: 'SCHEDULED', early_signin_minutes: 10 }, at('07:55'))).toBe(true)
    expect(isAccepting({ ...base, status: 'SCHEDULED', early_signin_minutes: 10 }, at('07:49'))).toBe(false)
  })
  it('OPEN accepts until the deadline; the deadline instant itself is closed', () => {
    const s = { ...base, status: 'OPEN' }
    expect(isAccepting(s, at('08:30'))).toBe(true)
    expect(isAccepting(s, at('12:00'))).toBe(true) // scheduled end is NOT closure
    expect(isAccepting(s, at('12:14'))).toBe(true)
    expect(isAccepting(s, at('12:15'))).toBe(false)
  })
  it('distinguishes scheduled end from auto-close', () => {
    const s = { ...base, status: 'OPEN' }
    expect(sessionPhase(s, at('11:59'))).toBe('IN_PROGRESS')
    expect(sessionPhase(s, at('12:05'))).toBe('GRACE_PERIOD')
    expect(sessionPhase(s, at('12:15'))).toBe('AUTO_CLOSED')
  })
  it('effective status flips to AUTO_CLOSED at the deadline', () => {
    expect(effectiveStatus({ ...base, status: 'OPEN' }, at('12:14'))).toBe('OPEN')
    expect(effectiveStatus({ ...base, status: 'OPEN' }, at('12:15'))).toBe('AUTO_CLOSED')
    expect(effectiveStatus({ ...base, status: 'REOPENED' }, at('12:15'))).toBe('AUTO_CLOSED')
  })
  it('a manually CLOSED class never accepts attendance', () => {
    expect(isAccepting({ ...base, status: 'CLOSED' }, at('09:00'))).toBe(false)
    expect(isAccepting({ ...base, status: 'CANCELLED' }, at('09:00'))).toBe(false)
  })
  it('a reopened class accepts until its NEW deadline only', () => {
    const s = { ...base, status: 'REOPENED', auto_close_at: at('13:00') }
    expect(isAccepting(s, at('12:30'))).toBe(true)
    expect(isAccepting(s, at('13:00'))).toBe(false)
  })
  it('addMinutes builds the deadline from end + grace', () => { expect(addMinutes(base.scheduled_end, 15)).toBe(base.auto_close_at) })
})

describe('attendance status and duration', () => {
  it('PRESENT within the grace period, LATE after it', () => {
    expect(attendanceStatus(at('08:15'), base.scheduled_start, 15)).toBe('PRESENT')
    expect(attendanceStatus(at('08:16'), base.scheduled_start, 15)).toBe('LATE')
    expect(attendanceStatus(at('07:50'), base.scheduled_start, 15)).toBe('PRESENT')
  })
  it('calculates duration in whole minutes', () => {
    expect(durationMinutes(at('08:05'), at('11:50'))).toBe(225)
    expect(formatDuration(225)).toBe('3h 45m'); expect(formatDuration(5)).toBe('5m'); expect(formatDuration(null)).toBe('—')
  })
})

describe('registration validation', () => {
  const ok = { full_name: 'Ada Obi', matric_number: ' csc/22/001 ', phone: '+234 801 234 5678', email: 'ada@example.com', address: '12 Market Road, Enugu', consent: true }
  it('accepts valid data and normalises the matric number', () => {
    const r = registrationSchema.safeParse(ok); expect(r.success).toBe(true); expect(r.data.matric_number).toBe('CSC/22/001')
  })
  it.each([['full_name', 'A'], ['matric_number', '!!'], ['phone', 'abc'], ['email', 'nope'], ['address', 'x'], ['consent', false]])('rejects bad %s', (k, v) => {
    const r = registrationSchema.safeParse({ ...ok, [k]: v }); expect(r.success).toBe(false); expect(r.error.issues[0].path[0]).toBe(k)
  })
  it('validates passport photos by type and size', () => {
    expect(validatePhoto(null)).toMatch(/required/)
    expect(validatePhoto({ type: 'application/pdf', size: 10 })).toMatch(/JPG/)
    expect(validatePhoto({ type: 'image/png', size: MAX_PHOTO_BYTES + 1 })).toMatch(/2 MB/)
    expect(validatePhoto({ type: 'image/jpeg', size: 1000 })).toBeNull()
  })
  it('validates class sessions (end after start)', () => {
    const v = { course_id: crypto.randomUUID(), academic_session_id: crypto.randomUUID(), semester: 'FIRST', date: '2026-03-10', start: '08:00', end: '12:00', grace_minutes: 15, early_signin_minutes: 0, late_after_minutes: 15 }
    expect(classSessionSchema.safeParse(v).success).toBe(true)
    expect(classSessionSchema.safeParse({ ...v, end: '07:00' }).success).toBe(false)
  })
})

describe('csv export', () => {
  it('escapes quotes/commas and neutralises formula injection', () => {
    const csv = toCsv([{ n: 'Obi, Ada', m: '=cmd()' }, { n: 'He said "hi"', m: 'ok' }], [{ label: 'Name', value: 'n' }, { label: 'Matric', value: 'm' }])
    expect(csv).toContain('"Obi, Ada"'); expect(csv).toContain("'=cmd()"); expect(csv).toContain('"He said ""hi"""')
  })
})

describe('error messages', () => {
  it('maps database errors to friendly text', () => {
    expect(friendlyError({ message: 'NOT_AUTHORIZED: you cannot control this class session' })).toBe('you cannot control this class session')
    expect(friendlyError({ message: 'new row violates row-level security policy' })).toMatch(/permission/)
    expect(friendlyError({ message: 'Failed to fetch' })).toMatch(/Network/)
  })
})

describe('biometric adapters', () => {
  beforeEach(() => {
    const store = {}
    globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v }, removeItem: (k) => { delete store[k] } }
  })
  it('mock adapter enrols, identifies a placed finger, rejects unknown fingers, and honours abort', async () => {
    const { MockBiometricAdapter } = await import('../src/services/biometric/MockBiometricAdapter')
    const a = new MockBiometricAdapter()
    const e = await a.enroll('CSC/22/001'); expect(e.success).toBe(true); expect(e.templateReference).toMatch(/^mock-/)
    const p1 = a.identify(); a.placeFinger(e.templateReference)
    await expect(p1).resolves.toMatchObject({ success: true, templateReference: e.templateReference })
    const p2 = a.identify(); a.placeFinger('unknown'); await expect(p2).resolves.toMatchObject({ success: false, code: 'NO_MATCH' })
    const ctrl = new AbortController(); const p3 = a.identify({ signal: ctrl.signal }); ctrl.abort(); await expect(p3).rejects.toMatchObject({ name: 'AbortError' })
    a.setConnected(false); await expect(a.identify()).resolves.toMatchObject({ success: false, code: 'DEVICE_ERROR' })
    expect((await a.getDeviceStatus()).connected).toBe(false)
  }, 15000)
  it('the mock adapter never returns raw biometric data', async () => {
    const { MockBiometricAdapter } = await import('../src/services/biometric/MockBiometricAdapter')
    const e = await new MockBiometricAdapter().enroll('X/1'); expect(Object.keys(e).sort()).toEqual(['provider', 'success', 'templateReference'])
  })
  it('the mock adapter is refused in production unless explicitly allowed', async () => {
    const { createAdapter } = await import('../src/services/biometric')
    expect(() => createAdapter('mock', { isProd: true, allowMockInProd: false })).toThrow(/disabled in production/)
    expect(createAdapter('mock', { isProd: true, allowMockInProd: true }).mode).toBe('mock')
    expect(createAdapter('bridge', { isProd: true }).mode).toBe('bridge')
  })
  it('the hardware adapter never pretends to work', async () => {
    const { HardwareBiometricAdapter } = await import('../src/services/biometric/HardwareBiometricAdapter')
    const h = new HardwareBiometricAdapter(); expect((await h.getDeviceStatus()).connected).toBe(false); expect((await h.identify()).success).toBe(false)
  })
})
