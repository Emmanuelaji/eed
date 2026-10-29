import { clsx } from 'clsx'

export default function Logo({ className, size = 40, withText = false, light = false }) {
  return (
    <span className={clsx('inline-flex items-center gap-3', className)}>
      <img src="/favicon.svg" width={size} height={size} alt="EED logo" />
      {withText && <span className={clsx('leading-tight', light ? 'text-white' : 'text-primary')}>
        <span className="block text-lg font-bold">EED</span>
        <span className={clsx('block text-[11px]', light ? 'text-white/80' : 'text-text-secondary')}>Electronic Entry &amp; Departure</span>
      </span>}
    </span>
  )
}
