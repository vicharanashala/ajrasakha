import { Fragment, useMemo, useState } from 'react'
import Spark from './Spark.jsx'

const TREND_CLASS = { Surging: 'bad', New: 'warn', Growing: 'warn', Stable: 'mute', Declining: 'good' }

export default function GapTable({ clusters }) {
  const [crop, setCrop] = useState('')
  const [trend, setTrend] = useState('')
  const [open, setOpen] = useState(null)

  const crops = useMemo(() => [...new Set(clusters.map((c) => c.crop))].sort(), [clusters])
  const rows = clusters.filter((c) => (!crop || c.crop === crop) && (!trend || c.trend === trend))

  return (
    <div className="card">
      <div className="toolbar">
        <h2>Top {clusters.length} question types needing GDB coverage</h2>
        <div className="filters">
          <select value={crop} onChange={(e) => setCrop(e.target.value)} aria-label="Filter by crop">
            <option value="">All crops</option>
            {crops.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select value={trend} onChange={(e) => setTrend(e.target.value)} aria-label="Filter by trend">
            <option value="">All trends</option>
            {Object.keys(TREND_CLASS).map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr><th>#</th><th>Question type</th><th>Crop · Domain</th><th className="num">Open</th><th>8-week trend</th><th>Trend</th><th>Top states</th><th className="num">Score</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <Fragment key={c.cluster_id}>
                <tr className="click" onClick={() => setOpen(open === c.cluster_id ? null : c.cluster_id)}>
                  <td>{c.rank}</td>
                  <td className="q">{c.label}<div className="intent">{c.intent}</div></td>
                  <td>{c.crop}<div className="intent">{c.domain}</div></td>
                  <td className="num"><b>{c.open}</b></td>
                  <td><Spark data={c.weekly} /></td>
                  <td><span className={`pill ${TREND_CLASS[c.trend]}`}>{c.trend}</span><div className="intent">{c.recent_7d} vs {c.prev_7d} last wk</div></td>
                  <td>{c.states.slice(0, 3).map((s) => `${s.state} (${s.count})`).join(', ')}</td>
                  <td className="num"><div className="score"><i style={{ width: `${c.priority_score}%` }} /></div>{c.priority_score}</td>
                </tr>
                {open === c.cluster_id && (
                  <tr className="detail">
                    <td />
                    <td colSpan={7}>
                      <div><b>Similar questions grouped here</b> <span className="intent">(showing {c.examples.length} of {c.size} logged queries, worded differently but asking the same thing)</span></div>
                      <ul>{c.examples.map((e, i) => <li key={i}>{e}</li>)}</ul>
                      <div><b>Keywords:</b> {c.keywords.join(', ') || '—'} · <b>Resolved so far:</b> {c.resolved} of {c.size}</div>
                      <div><b>Top states:</b> {[...c.states]
                        .sort((a, b) => (a.state === 'Unknown') - (b.state === 'Unknown') || b.count - a.count)
                        .slice(0, 6).map((s) => `${s.state} (${s.count})`).join(' · ') || '—'}</div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
        {!rows.length && <p className="empty">No clusters match these filters.</p>}
      </div>
    </div>
  )
}
