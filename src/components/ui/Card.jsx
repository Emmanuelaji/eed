import { clsx } from 'clsx'

export const Card = ({ children, className, ...props }) => <div className={clsx('card p-5 sm:p-6', className)} {...props}>{children}</div>
export const CardHeader = ({ children, className }) => <div className={clsx('mb-4', className)}>{children}</div>
export const CardTitle = ({ children, className }) => <h2 className={clsx('text-lg font-semibold text-text-main', className)}>{children}</h2>
export const CardDescription = ({ children, className }) => <p className={clsx('mt-1 text-sm text-text-secondary', className)}>{children}</p>
export const CardContent = ({ children, className }) => <div className={className}>{children}</div>
