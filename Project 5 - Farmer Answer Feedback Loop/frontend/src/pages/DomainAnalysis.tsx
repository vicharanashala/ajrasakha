import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell, RadialBarChart, RadialBar, Legend,
} from 'recharts'
import { getDomainBreakdown } from '../client/api'
import {
  FiGrid, FiAlertTriangle, FiZap, FiCheckCircle, FiBarChart2,
  FiPackage, FiList, FiThumbsUp, FiThumbsDown, FiFlag
} from 'react-icons/fi'

const COLORS = [
  '#22c55e','#3b82f6','#f59e0b','#a855f7','#ef4444',
  '#06b6d4','#f97316','#84cc16','#ec4899','#14b8a6',
]

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: 'var(--green-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <FiThumbsUp size={12} /> Helpful: {d.helpful_count} ({d.helpfulness_score.toFixed(1)}%)
      </div>
      <div style={{ color: 'var(--red-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <FiThumbsDown size={12} /> Not Helpful: {d.not_helpful_count}
      </div>
      <div style={{ color: 'var(--text-muted)' }}>Total: {d.total_responses}</div>
    </div>
  )
}

export default function DomainAnalysis() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getDomainBreakdown()
      .then(d => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Loading domain data...</span></div>

  const sorted = [...data].sort((a, b) => b.total_responses - a.total_responses)
  const byScore = [...data].sort((a, b) => a.helpfulness_score - b.helpfulness_score)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><FiGrid style={{ marginRight: '8px' }} /> Domain Analysis</h1>
        <p className="page-subtitle">Helpfulness breakdown by agricultural domain</p>
      </div>

      {/* Summary Cards */}
      <div className="stat-grid mb-6">
        {byScore.slice(0, 3).map((d, i) => (
          <div key={d.name} className="stat-card" style={{
            '--accent-color': i === 0 ? 'var(--red-500)' : i === 1 ? 'var(--amber-500)' : 'var(--green-500)',
            '--icon-bg': i === 0 ? 'var(--red-glow)' : i === 1 ? 'var(--amber-glow)' : 'var(--green-glow)',
          } as any}>
            <div className="stat-icon">{i === 0 ? <FiAlertTriangle /> : i === 1 ? <FiZap /> : <FiCheckCircle />}</div>
            <div className="stat-value" style={{ fontSize: '1.4rem', color: i === 0 ? 'var(--red-400)' : i === 1 ? 'var(--amber-400)' : 'var(--green-400)' }}>
              {d.helpfulness_score.toFixed(1)}%
            </div>
            <div className="stat-label">{d.name}</div>
            <div className="stat-sub">{d.total_responses} responses</div>
          </div>
        ))}
      </div>

      <div className="grid-2 mb-6">
        {/* Helpfulness by Domain */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FiBarChart2 style={{ marginRight: '6px' }} /> Helpfulness Score by Domain</span>
            <span className="badge badge-domain">Sorted: Low → High</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={byScore} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="helpfulness_score" radius={[0, 4, 4, 0]} name="Helpfulness">
                  {byScore.map((entry, i) => (
                    <Cell
                      key={entry.name}
                      fill={entry.helpfulness_score >= 60 ? '#22c55e' : entry.helpfulness_score >= 40 ? '#f59e0b' : '#ef4444'}
                      opacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Volume by Domain */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FiPackage style={{ marginRight: '6px' }} /> Response Volume by Domain</span>
            <span className="badge badge-domain">Sorted: Most Active</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={340}>
              <BarChart data={sorted} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={110} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="helpful_count" stackId="a" fill="#22c55e" name="Helpful" radius={[0, 0, 0, 0]} />
                <Bar dataKey="not_helpful_count" stackId="a" fill="#ef4444" name="Not Helpful" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Domain Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><FiList style={{ marginRight: '6px' }} /> Full Domain Breakdown</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Total Responses</th>
                <th>Helpful</th>
                <th>Not Helpful</th>
                <th style={{ minWidth: 200 }}>Helpfulness Score</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map(d => {
                const scoreClass = d.helpfulness_score >= 60 ? 'score-high' : d.helpfulness_score >= 40 ? 'score-mid' : 'score-low'
                const fillClass = d.helpfulness_score >= 60 ? 'fill-high' : d.helpfulness_score >= 40 ? 'fill-mid' : 'fill-low'
                return (
                  <tr key={d.name}>
                    <td><span className="badge badge-domain">{d.name}</span></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{d.total_responses}</td>
                    <td style={{ color: 'var(--green-400)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiThumbsUp size={12} /> {d.helpful_count}</span>
                    </td>
                    <td style={{ color: 'var(--red-400)' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiThumbsDown size={12} /> {d.not_helpful_count}</span>
                    </td>
                    <td>
                      <div className="helpfulness-bar-wrap">
                        <div className="helpfulness-bar-bg">
                          <div className={`helpfulness-bar-fill ${fillClass}`} style={{ width: `${d.helpfulness_score}%` }} />
                        </div>
                        <span className={`helpfulness-score ${scoreClass}`}>{d.helpfulness_score.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td>
                      {d.helpfulness_score >= 60
                        ? <span className="badge badge-resolved"><FiCheckCircle style={{ marginRight: '4px' }} /> Good</span>
                        : d.helpfulness_score >= 40
                        ? <span className="badge badge-review"><FiZap style={{ marginRight: '4px' }} /> Review</span>
                        : <span className="badge badge-flagged"><FiFlag style={{ marginRight: '4px' }} /> Critical</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
