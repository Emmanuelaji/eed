import { BiometricInterface } from './BiometricInterface'

/**
 * Placeholder for a DIRECT vendor SDK integration (e.g. a WebAuthn/WebUSB or native-wrapper approach).
 * Intentionally NOT implemented: a browser cannot talk to arbitrary USB fingerprint scanners, and this project
 * does not claim compatibility with any device. Implement the methods for your verified hardware or use the
 * LocalBiometricBridgeAdapter. See docs/hardware-integration.md.
 */
export class HardwareBiometricAdapter extends BiometricInterface {
  mode = 'hardware'
  async getDeviceStatus() {
    return { connected: false, mode: this.mode, message: 'No hardware adapter has been implemented for this deployment.' }
  }
  async enroll() { return { success: false, code: 'NOT_IMPLEMENTED', message: 'Hardware adapter not implemented' } }
  async identify() { return { success: false, code: 'NOT_IMPLEMENTED', message: 'Hardware adapter not implemented' } }
  async verify() { return { success: false, code: 'NOT_IMPLEMENTED' } }
  async remove() { return { success: false, code: 'NOT_IMPLEMENTED' } }
}
