import { useMemo, useState } from 'react'

const TREND_CLASS = { Surging: 'bad', New: 'warn', Growing: 'warn', Stable: 'mute', Declining: 'good' }

export default function Outreach({ rows, clusters = [] }) {
  const [open, setOpen] = useState(() => new Set())

  // keep backend order (most gaps first) but always put "Unknown" last
  const sorted = useMemo(() => [...rows].sort((a, b) => (a.state === 'Unknown') - (b.state === 'Unknown')), [rows])
  const max = Math.max(...rows.map((r) => r.open_gaps), 1)

  const toggle = (state) =>
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(state) ? next.delete(state) : next.add(state)
      return next
    })

  return (
    <div className="card">
      <div className="toolbar"><h2>Where should field engagement go next?</h2></div>
      <p className="sub">States ranked by unanswered farmer queries (boosted when the gap is growing). Click a state to see all of its details.</p>
      <div className="cards">
        {sorted.map((o, i) => {
          const isOpen = open.has(o.state)
          const stateClusters = clusters
            .map((c) => ({ c, n: c.states.find((s) => s.state === o.state)?.count || 0 }))
            .filter((x) => x.n > 0)
            .sort((a, b) => b.n - a.n)
          return (
            <article key={o.state} className={`state ${isOpen ? 'open' : ''}`}>
              <button type="button" className="state-head" aria-expanded={isOpen} onClick={() => toggle(o.state)}>
                <span className="state-top">
                  <h3>{i + 1}. {o.state}</h3>
                  <span className="state-meta">
                    <span className={`pill ${TREND_CLASS[o.trend]}`}>{o.trend}</span>
                    <span className="chev">{isOpen ? '▲' : '▼'}</span>
                  </span>
                </span>
                <span className="bar"><i style={{ width: `${(o.open_gaps / max) * 100}%` }} /></span>
                <span className="big">{o.open_gaps.toLocaleString()} <small>unanswered · {(o.share * 100).toFixed(0)}% of all gaps</small></span>
                <span className="rec">{o.recommendation}</span>
              </button>

              {isOpen && (
                <div className="state-detail">
                  <dl>
                    <dt>Unanswered</dt><dd>{o.open_gaps.toLocaleString()} queries ({(o.share * 100).toFixed(1)}% of all gaps)</dd>
                    <dt>Trend</dt><dd>{o.trend} · {o.recent_7d} in the last 7 days vs {o.prev_7d} the week before ({o.growth > 0 ? '+' : ''}{Math.round(o.growth * 100)}%)</dd>
                    <dt>Crops</dt><dd>{list(o.top_crops, 'crop')}</dd>
                    <dt>Domains</dt><dd>{list(o.top_domains, 'domain')}</dd>
                    <dt>Districts</dt><dd>{o.top_districts.length ? list(o.top_districts, 'district') : <span className="intent">not available: the logs do not record a district</span>}</dd>
                    <dt>Action</dt><dd>{o.recommendation}</dd>
                  </dl>

                  <h4>Priority question types here</h4>
                  {o.focus_clusters.length > 0 && (
                    <ul>{o.focus_clusters.map((c) => <li key={c.cluster_id}>{c.label} <span className="intent">({c.crop} · {c.domain})</span></li>)}</ul>
                  )}

                  {stateClusters.length > 0 && (
                    <>
                      <h4>All top-20 question types asked in {o.state}</h4>
                      <table className="mini">
                        <thead><tr><th>Question type</th><th>Crop · Domain</th><th className="num">Queries here</th><th>Trend</th></tr></thead>
                        <tbody>
                          {stateClusters.map(({ c, n }) => (
                            <tr key={c.cluster_id}>
                              <td>{c.label}</td>
                              <td>{c.crop} · {c.domain}</td>
                              <td className="num">{n}</td>
                              <td><span className={`pill ${TREND_CLASS[c.trend]}`}>{c.trend}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

const list = (items, key) => items.map((x) => `${x[key]} (${x.count})`).join(', ') || '—'
