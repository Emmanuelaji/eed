import { createClient } from '@supabase/supabase-js'

// Tolerate common .env mistakes: surrounding quotes and stray whitespace.
const clean = (v) => String(v ?? '').trim().replace(/^['"]|['"]$/g, '').trim()
const url = clean(import.meta.env.VITE_SUPABASE_URL)
const anon = clean(import.meta.env.VITE_SUPABASE_ANON_KEY)

function validUrl(u) {
  try { const p = new URL(u); return (p.protocol === 'https:' || p.protocol === 'http:') && !u.includes('YOUR-PROJECT') } catch { return false }
}

export const isSupabaseConfigured = validUrl(url) && anon.length > 20 && !anon.includes('YOUR-ANON')

export const supabaseConfigProblem = isSupabaseConfigured ? null
  : !url ? 'VITE_SUPABASE_URL is empty.'
  : !validUrl(url) ? `VITE_SUPABASE_URL must be a full URL like https://abcdefgh.supabase.co (got "${url}").`
  : 'VITE_SUPABASE_ANON_KEY is missing or still a placeholder.'

// Only the public anon key is ever used in the browser. Security is enforced by RLS + SECURITY DEFINER functions.
export const supabase = isSupabaseConfigured
  ? createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null

if (!isSupabaseConfigured && typeof console !== 'undefined') console.warn(`[EED] Supabase not configured: ${supabaseConfigProblem}`)
