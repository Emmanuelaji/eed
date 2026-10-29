const escape = (v) => {
  if (v == null) return ''
  let s = String(v)
  // neutralise spreadsheet formula injection
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(rows, columns) {
  const head = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((r) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(r) : r[c.value])).join(','))
  return [head, ...body].join('\r\n')
}

export function downloadCsv(filename, csv) {
  const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
}
