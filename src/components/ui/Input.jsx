import { forwardRef, useId } from 'react'
import { clsx } from 'clsx'

const Field = ({ id, label, error, required, hint, children }) => (
  <div className="w-full">
    {label && <label htmlFor={id} className={clsx('label', required && 'label-required')}>{label}</label>}
    {children}
    {hint && !error && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
    {error && <p id={`${id}-err`} role="alert" className="mt-1 text-sm text-error">{error}</p>}
  </div>
)

const Input = forwardRef(({ label, error, required, hint, className, id, ...props }, ref) => {
  const auto = useId(); const fid = id || auto
  return (
    <Field id={fid} label={label} error={error} required={required} hint={hint}>
      <input id={fid} ref={ref} aria-invalid={Boolean(error)} aria-describedby={error ? `${fid}-err` : undefined} className={clsx('input', error && 'input-error', className)} {...props} />
    </Field>
  )
})
Input.displayName = 'Input'

export const Select = forwardRef(({ label, error, required, hint, className, id, children, ...props }, ref) => {
  const auto = useId(); const fid = id || auto
  return (
    <Field id={fid} label={label} error={error} required={required} hint={hint}>
      <select id={fid} ref={ref} aria-invalid={Boolean(error)} className={clsx('input', error && 'input-error', className)} {...props}>{children}</select>
    </Field>
  )
})
Select.displayName = 'Select'

export const Textarea = forwardRef(({ label, error, required, hint, className, id, rows = 3, ...props }, ref) => {
  const auto = useId(); const fid = id || auto
  return (
    <Field id={fid} label={label} error={error} required={required} hint={hint}>
      <textarea id={fid} ref={ref} rows={rows} aria-invalid={Boolean(error)} className={clsx('input', error && 'input-error', className)} {...props} />
    </Field>
  )
})
Textarea.displayName = 'Textarea'

export default Input
