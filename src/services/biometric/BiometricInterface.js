/**
 * Contract every biometric adapter implements.
 *
 * Privacy: adapters return only an OPAQUE template reference (never a raw image or template bytes).
 * EED stores that reference; matching happens on the scanner/SDK/bridge, not in the browser or in Supabase.
 *
 * Result shapes:
 *   getDeviceStatus() -> { connected, deviceId, model, mode, message? }
 *   enroll(studentReference, { signal }) -> { success, templateReference, provider, code?, message? }
 *   identify({ signal })                 -> { success, templateReference?, code?: 'NO_MATCH'|'TIMEOUT'|'DEVICE_ERROR' }
 *   verify(studentReference, { signal }) -> { success, code? }
 *   remove(studentReference)             -> { success }
 */
export class BiometricInterface {
  mode = 'abstract'
  async getDeviceStatus() { throw new Error('getDeviceStatus not implemented') }
  async enroll(/* studentReference, opts */) { throw new Error('enroll not implemented') }
  async identify(/* opts */) { throw new Error('identify not implemented') }
  async verify(/* studentReference, opts */) { throw new Error('verify not implemented') }
  async remove(/* studentReference */) { throw new Error('remove not implemented') }
}

export class BiometricError extends Error {
  constructor(code, message) { super(message); this.code = code; this.name = 'BiometricError' }
}
