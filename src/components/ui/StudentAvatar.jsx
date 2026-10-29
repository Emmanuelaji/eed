import { clsx } from 'clsx'
import { User } from 'lucide-react'
import { usePassportUrl } from '../../hooks/usePassport'

export default function StudentAvatar({ path, name, className = 'h-10 w-10' }) {
  const url = usePassportUrl(path)
  return url
    ? <img src={url} alt={name ? `Passport of ${name}` : 'Passport photograph'} className={clsx('rounded-full object-cover', className)} />
    : <span className={clsx('flex items-center justify-center rounded-full bg-mint text-primary', className)} aria-hidden="true"><User className="h-1/2 w-1/2" /></span>
}
