import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { clsx } from 'clsx'

const variants = { primary: 'btn-primary', secondary: 'btn-secondary', danger: 'btn-danger', outline: 'btn-outline', ghost: 'btn-ghost' }
const sizes = { sm: 'btn-sm', md: 'btn-md', lg: 'btn-lg' }

const Button = forwardRef(({ children, variant = 'primary', size = 'md', loading = false, disabled, className, type = 'button', ...props }, ref) => (
  <button ref={ref} type={type} disabled={disabled || loading} className={clsx(variants[variant], sizes[size], className)} {...props}>
    {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
    {children}
  </button>
))
Button.displayName = 'Button'
export default Button
