import { useEffect, useState } from 'react'
import { getPassportUrl } from '../services/storageService'

export function usePassportUrl(path) {
  const [url, setUrl] = useState(null)
  useEffect(() => {
    let live = true
    setUrl(null)
    if (path) getPassportUrl(path).then((u) => live && setUrl(u))
    return () => { live = false }
  }, [path])
  return url
}
