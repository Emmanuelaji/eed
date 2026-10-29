import { MockBiometricAdapter } from './MockBiometricAdapter'
import { LocalBiometricBridgeAdapter } from './LocalBiometricBridgeAdapter'
import { HardwareBiometricAdapter } from './HardwareBiometricAdapter'

let instance = null

/** Pick the adapter from VITE_BIOMETRIC_MODE. The mock is refused in production builds unless explicitly allowed for a demo. */
export function createAdapter(mode, { isProd, allowMockInProd } = {}) {
  switch (mode) {
    case 'bridge': return new LocalBiometricBridgeAdapter()
    case 'hardware': return new HardwareBiometricAdapter()
    case 'mock':
    default:
      if (isProd && !allowMockInProd) {
        throw new Error('The mock biometric adapter is disabled in production. Set VITE_BIOMETRIC_MODE=bridge, or VITE_ALLOW_MOCK_IN_PROD=true for a clearly-labelled demo.')
      }
      return new MockBiometricAdapter()
  }
}

export function getBiometricAdapter() {
  if (!instance) {
    instance = createAdapter(import.meta.env.VITE_BIOMETRIC_MODE || 'mock', {
      isProd: import.meta.env.PROD,
      allowMockInProd: import.meta.env.VITE_ALLOW_MOCK_IN_PROD === 'true',
    })
  }
  return instance
}
