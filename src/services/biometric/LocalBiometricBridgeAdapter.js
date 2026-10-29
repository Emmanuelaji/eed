import { BiometricInterface } from './BiometricInterface'

/**
 * Talks to a TRUSTED program running on the same PC as the scanner (vendor SDK wrapped in a tiny local HTTP service).
 * The bridge does the capture and the matching; this app receives only an opaque template reference.
 * See docs/hardware-integration.md for the exact HTTP contract the bridge must implement.
 * NOT verified against any specific scanner model.
 */
export class LocalBiometricBridgeAdapter extends BiometricInterface {
  mode = 'bridge'
  provider = 'local-bridge'

  constructor(baseUrl = import.meta.env.VITE_BIOMETRIC_BRIDGE_URL || 'http://127.0.0.1:8787') {
    super()
    this.baseUrl = baseUrl.replace(/\/$/, '')
  }

  async call(path, body, { signal, timeoutMs = 30000 } = {}) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), timeoutMs)
    signal?.addEventListener('abort', () => ctrl.abort())
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      })
      if (!res.ok) throw new Error(`Bridge responded ${res.status}`)
      return await res.json()
    } finally { clearTimeout(t) }
  }

  async getDeviceStatus() {
    try {
      const s = await this.call('/status', null, { timeoutMs: 4000 })
      return { connected: Boolean(s.connected), deviceId: s.deviceId, model: s.model, mode: this.mode, message: s.message }
    } catch {
      return { connected: false, mode: this.mode, message: 'Cannot reach the local fingerprint bridge. Is it running?' }
    }
  }
  async enroll(studentReference, opts) {
    try { const r = await this.call('/enroll', { studentReference }, { ...opts, timeoutMs: 60000 }); return { ...r, provider: this.provider } }
    catch (e) { return { success: false, code: 'DEVICE_ERROR', message: e.message } }
  }
  async identify(opts) {
    try { const r = await this.call('/identify', {}, opts); return { ...r, provider: this.provider } }
    catch (e) { if (e.name === 'AbortError' && opts?.signal?.aborted) throw e; return { success: false, code: 'DEVICE_ERROR', message: e.message } }
  }
  async verify(studentReference, opts) {
    try { return await this.call('/verify', { studentReference }, opts) } catch (e) { return { success: false, code: 'DEVICE_ERROR', message: e.message } }
  }
  async remove(studentReference) {
    try { return await this.call('/remove', { studentReference }) } catch (e) { return { success: false, message: e.message } }
  }
}
