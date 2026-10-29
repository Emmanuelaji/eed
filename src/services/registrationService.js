import { rpc, db } from './api'

const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export const registrationService = {
  getForm: (token) => rpc('get_registration_form', { p_token: token }),

  /** Upload the photo to registrations/<token>/<random>.<ext>, then register through the validated RPC. */
  async register(token, values, photo) {
    const path = `registrations/${token.toUpperCase()}/${crypto.randomUUID()}.${EXT[photo.type]}`
    const { error } = await db().storage.from('passports').upload(path, photo, { contentType: photo.type, upsert: false })
    if (error) throw error
    return rpc('register_student', { p_token: token, p_data: { ...values, passport_path: path } })
  },
}

export const registrationUrl = (token) => `${window.location.origin}/register/${token}`
