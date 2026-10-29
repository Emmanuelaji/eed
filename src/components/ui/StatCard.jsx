import { Card } from './Card'

export default function StatCard({ label, value, icon: Icon, hint }) {
  return (
    <Card className="!p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-text-secondary">{label}</p>
        {Icon && <span className="rounded-lg bg-mint p-2 text-primary"><Icon className="h-4 w-4" aria-hidden="true" /></span>}
      </div>
      <p className="mt-2 text-2xl font-bold">{value ?? '—'}</p>
      {hint && <p className="mt-1 text-xs text-text-secondary">{hint}</p>}
    </Card>
  )
}
