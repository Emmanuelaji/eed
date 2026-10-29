import { db } from './api'

const cache = new Map()

/** Short-lived signed URL for a private passport photograph (RLS decides who may sign). */
export async function getPassportUrl(path) {
  if (!path) return null
  const hit = cache.get(path)
  if (hit && hit.expires > Date.now()) return hit.url
  const { data, error } = await db().storage.from('passports').createSignedUrl(path, 300)
  if (error) return null
  cache.set(path, { url: data.signedUrl, expires: Date.now() + 240000 })
  return data.signedUrl
}
