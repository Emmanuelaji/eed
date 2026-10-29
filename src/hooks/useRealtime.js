import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

/**
 * Subscribe to Postgres changes and call onChange (debounced) so the caller re-queries the database.
 * Events are only a "something changed" hint — the re-query goes through RLS, so Realtime can never bypass authorisation,
 * and duplicate/out-of-order events are harmless. Cleans up on unmount and reports connection state.
 */
export function useRealtime(tables, onChange, { filter } = {}) {
  const [status, setStatus] = useState('connecting')
  const cb = useRef(onChange); cb.current = onChange
  const key = tables.join(',') + (filter || '')
  useEffect(() => {
    if (!supabase) return undefined
    let timer
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb.current?.(), 300) }
    let ch = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2)}`)
    tables.forEach((table) => { ch = ch.on('postgres_changes', { event: '*', schema: 'public', table, ...(filter && table === tables[0] ? { filter } : {}) }, fire) })
    ch.subscribe((s) => {
      if (s === 'SUBSCRIBED') { setStatus('live'); cb.current?.() } // refresh after (re)connect to catch missed events
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') setStatus('reconnecting')
      else if (s === 'CLOSED') setStatus('offline')
    })
    return () => { clearTimeout(timer); supabase.removeChannel(ch) }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return status
}
