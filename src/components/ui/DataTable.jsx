import { clsx } from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Button from './Button'

/**
 * Responsive table: a real table from md up, stacked cards on phones (no horizontal overflow).
 * columns: [{ key, header, render?(row), className?, hideOnMobile? , primary? }]
 */
export default function DataTable({ columns, rows, rowKey = 'id', onRowClick, caption }) {
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-border">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={clsx('th', c.className)}>{c.header}</th>)}</tr></thead>
          <tbody className="divide-y divide-border bg-white">
            {rows.map((r) => (
              <tr key={r[rowKey]} className={clsx(onRowClick && 'cursor-pointer hover:bg-mint/50')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                {columns.map((c) => <td key={c.key} className={clsx('td', c.className)}>{c.render ? c.render(r) : r[c.key] ?? '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((r) => (
          <li key={r[rowKey]} className={clsx('space-y-1.5 py-3', onRowClick && 'cursor-pointer')} onClick={onRowClick ? () => onRowClick(r) : undefined}>
            {columns.filter((c) => !c.hideOnMobile).map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 text-text-secondary">{c.header}</span>
                <span className="min-w-0 break-words text-right">{c.render ? c.render(r) : r[c.key] ?? '—'}</span>
              </div>
            ))}
          </li>
        ))}
      </ul>
    </>
  )
}

export function Pagination({ page, pageSize, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total <= pageSize) return null
  return (
    <nav className="no-print mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
      <span className="text-text-secondary">Page {page + 1} of {pages} · {total} records</span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </nav>
  )
}
