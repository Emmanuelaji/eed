import { useLocation } from 'react-router-dom'

/** '/admin' or '/lecturer' — lets shared pages link within the current role's area. */
export function useBase() {
  const { pathname } = useLocation()
  return pathname.startsWith('/lecturer') ? '/lecturer' : '/admin'
}
