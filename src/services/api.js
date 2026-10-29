import { supabase } from '../lib/supabase'

function client() {
  if (!supabase) throw new Error('Supabase is not configured. Copy .env.example to .env and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
  return supabase
}

/** Call a database function. Authorisation failures throw; business outcomes come back as {ok, code, ...}. */
export async function rpc(name, args = {}) {
  const { data, error } = await client().rpc(name, args)
  if (error) throw error
  return data
}

/** Unwrap a supabase-js query result. */
export async function run(query) {
  const { data, error, count } = await query
  if (error) throw error
  return { data, count }
}

export const db = () => client()
