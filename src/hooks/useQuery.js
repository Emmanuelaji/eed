import { useCallback, useEffect, useRef, useState } from 'react'
import { friendlyError } from '../lib/errors'

/** Run an async loader; exposes loading / error / data separately so "empty" is never confused with "failed". */
export function useQuery(loader, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const seq = useRef(0)
  const load = useCallback(async ({ silent = false } = {}) => {
    const id = ++seq.current
    if (!silent) setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await loader()
      if (id === seq.current) setState({ data, loading: false, error: null })
    } catch (e) {
      if (id === seq.current) setState((s) => ({ data: silent ? s.data : null, loading: false, error: friendlyError(e) }))
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load() }, [load])
  return { ...state, reload: load }
}
