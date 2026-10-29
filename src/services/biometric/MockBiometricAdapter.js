import { BiometricInterface } from './BiometricInterface'

const KEY = 'eed.mock.fingers'

/**
 * DEVELOPMENT / DEMO ONLY. Simulates a scanner so the whole workflow can be exercised without hardware.
 * Nothing here is real biometrics. "Fingers" are random IDs kept in this browser's localStorage; a developer panel
 * chooses which finger is "placed" on the pretend sensor.
 */
export class MockBiometricAdapter extends BiometricInterface {
  mode = 'mock'
  provider = 'mock'
  connected = true
  nextError = null
  waiter = null
  listeners = new Set()

  load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') } catch { return {} } }
  save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)) } catch { /* private mode */ } }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn) }
  emit() { this.listeners.forEach((fn) => fn()) }

  async getDeviceStatus() {
    return this.connected
      ? { connected: true, deviceId: 'MOCK-0001', model: 'Mock scanner (development)', mode: this.mode }
      : { connected: false, deviceId: null, model: 'Mock scanner', mode: this.mode, message: 'Mock scanner disconnected (simulated)' }
  }

  setConnected(v) { this.connected = v; this.emit() }
  simulateError() { this.nextError = 'DEVICE_ERROR'; this.waiter?.('error') }

  /** Developer panel: "place" a known finger (templateRef), an unknown finger (null). */
  placeFinger(templateRef) { this.waiter?.({ templateRef }) }
  listEnrolled() { return Object.entries(this.load()).map(([templateRef, label]) => ({ templateRef, label })) }

  async enroll(studentReference) {
    if (!this.connected) return { success: false, code: 'DEVICE_ERROR', message: 'Scanner disconnected' }
    await new Promise((r) => setTimeout(r, 1200)) // pretend to capture three samples
    const templateReference = `mock-${crypto.randomUUID()}`
    this.save({ ...this.load(), [templateReference]: studentReference })
    this.emit()
    return { success: true, templateReference, provider: this.provider }
  }

  identify({ signal } = {}) {
    if (!this.connected) return Promise.resolve({ success: false, code: 'DEVICE_ERROR', message: 'Scanner disconnected' })
    return new Promise((resolve, reject) => {
      const done = (v) => { this.waiter = null; signal?.removeEventListener('abort', onAbort); resolve(v) }
      const onAbort = () => { this.waiter = null; reject(Object.assign(new Error('aborted'), { name: 'AbortError' })) }
      signal?.addEventListener('abort', onAbort)
      this.waiter = (msg) => {
        if (msg === 'error') return done({ success: false, code: 'DEVICE_ERROR', message: 'Simulated scanner error' })
        setTimeout(() => {
          if (msg.templateRef && this.load()[msg.templateRef]) done({ success: true, templateReference: msg.templateRef, provider: this.provider })
          else done({ success: false, code: 'NO_MATCH' })
        }, 500)
      }
    })
  }

  async verify(studentReference) {
    return { success: Object.values(this.load()).includes(studentReference) }
  }

  async remove(studentReference) {
    const all = this.load()
    for (const [k, v] of Object.entries(all)) if (v === studentReference) delete all[k]
    this.save(all); this.emit()
    return { success: true }
  }
}
