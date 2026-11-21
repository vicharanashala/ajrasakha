async function get(path) {
  const r = await fetch(path)
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`)
  return r.json()
}

export const api = {
  report: () => get('/api/reports/latest'),
  meta: () => get('/api/meta'),
  heatmap: (p) => get('/api/heatmap?' + new URLSearchParams(Object.entries(p).filter(([, v]) => v))),
  run: () => fetch('/api/pipeline/run', { method: 'POST' }).then((r) => r.json()),
  csvUrl: '/api/reports/latest/export.csv',
  mdUrl: '/api/reports/latest/export.md',
}
