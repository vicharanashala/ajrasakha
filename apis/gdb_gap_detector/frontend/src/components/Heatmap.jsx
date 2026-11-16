import { useEffect, useMemo, useState } from 'react'
import { api } from '../api.js'

const DIMS = { crop: 'Crop', state: 'State', domain: 'Domain' }

// coverage 0 (all gap) -> 1 (fully covered): red -> amber -> green, as CSS hsl
const hue = (cov) => Math.round(cov * 125)

export default function Heatmap() {
  const [rows, setRows] = useState('crop')
  const [cols, setCols] = useState('state')
  const [filters, setFilters] = useState({ crop: '', state: '', domain: '' })
  const [meta, setMeta] = useState({ crops: [], states: [], domains: [] })
  const [data, setData] = useState(null)
  const [hover, setHover] = useState(null)
  const third = Object.keys(DIMS).find((d) => d !== rows && d !== cols)

  useEffect(() => { api.meta().then(setMeta) }, [])
  useEffect(() => {
    api.heatmap({ rows, cols, [third]: filters[third] }).then(setData)
  }, [rows, cols, third, filters])

  const index = useMemo(() => {
    const m = new Map()
    data?.cells.forEach((c) => m.set(`${c.row}|${c.col}`, c))
    return m
  }, [data])

  const options = { crop: meta.crops, state: meta.states, domain: meta.domains }

  const setAxis = (which, val) => {
    if (which === 'rows') { if (val === cols) setCols(rows); setRows(val) }
    else { if (val === rows) setRows(cols); setCols(val) }
    setFilters({ crop: '', state: '', domain: '' })
  }

  return (
    <div className="card">
      <div className="toolbar">
        <h2>GDB coverage heatmap</h2>
        <div className="filters">
          <label>Rows <select value={rows} onChange={(e) => setAxis('rows', e.target.value)}>{Object.entries(DIMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>Columns <select value={cols} onChange={(e) => setAxis('cols', e.target.value)}>{Object.entries(DIMS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          <label>{DIMS[third]}
            <select value={filters[third]} onChange={(e) => setFilters({ ...filters, [third]: e.target.value })}>
              <option value="">All (combined)</option>
              {options[third].map((o) => <option key={o}>{o}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="legend" aria-hidden="true">
        <span>Gap</span><div className="ramp" /><span>Strong coverage</span>
        <span className="hint">Coverage = GDB-answered ÷ (answered + still-unanswered farmer queries). Number in cell = open gaps.</span>
      </div>

      {data && (
        <div className="scroll">
          <table className="heat">
            <thead>
              <tr><th />{data.col_labels.map((c) => <th key={c} className="colh"><span>{c}</span></th>)}</tr>
            </thead>
            <tbody>
              {data.row_labels.map((r) => (
                <tr key={r}>
                  <th className="rowh">{r}</th>
                  {data.col_labels.map((c) => {
                    const cell = index.get(`${r}|${c}`)
                    if (!cell || cell.coverage === null) return <td key={c} className="none" aria-label="no data" />
                    return (
                      <td key={c}
                        style={{ background: `hsl(${hue(cell.coverage)} 62% var(--cell-l))` }}
                        onMouseEnter={() => setHover(cell)} onMouseLeave={() => setHover(null)}
                        title={`${r} × ${c}: ${Math.round(cell.coverage * 100)}% covered, ${cell.open_gaps} open gaps, ${cell.gdb_answers} GDB answers`}>
                        {cell.open_gaps || ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="hoverbar" aria-live="polite">
        {hover ? <><b>{hover.row} × {hover.col}</b> — {Math.round(hover.coverage * 100)}% covered ({hover.band}) · {hover.gdb_answers} GDB answers · {hover.open_gaps} open gaps</> : 'Hover a cell for details. Blank cells have no queries or GDB answers.'}
      </div>
    </div>
  )
}
