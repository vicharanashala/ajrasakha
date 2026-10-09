import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell,
} from 'recharts'
import { getStateBreakdown, getLanguageBreakdown } from '../client/api'
import {
  FiMap, FiMessageCircle, FiMapPin, FiList, FiThumbsUp, FiThumbsDown, FiBarChart2
} from 'react-icons/fi'

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 8, padding: '0.75rem 1rem', fontSize: '0.82rem' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{d.name}</div>
      <div style={{ color: 'var(--green-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <FiThumbsUp size={12} /> {d.helpful_count} helpful ({d.helpfulness_score.toFixed(1)}%)
      </div>
      <div style={{ color: 'var(--red-400)', display: 'flex', alignItems: 'center', gap: '4px' }}>
        <FiThumbsDown size={12} /> {d.not_helpful_count} not helpful
      </div>
      <div style={{ color: 'var(--text-muted)' }}>Total: {d.total_responses}</div>
    </div>
  )
}

function ScoreBar({ score }: { score: number }) {
  const fillClass = score >= 60 ? 'fill-high' : score >= 40 ? 'fill-mid' : 'fill-low'
  const scoreClass = score >= 60 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low'
  return (
    <div className="helpfulness-bar-wrap">
      <div className="helpfulness-bar-bg">
        <div className={`helpfulness-bar-fill ${fillClass}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className={`helpfulness-score ${scoreClass}`}>{score.toFixed(1)}%</span>
    </div>
  )
}

export default function StateLanguage() {
  const navigate = useNavigate()
  const [stateData, setStateData] = useState<any[]>([])
  const [langData, setLangData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getStateBreakdown(), getLanguageBreakdown()])
      .then(([s, l]) => { setStateData(s); setLangData(l) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading-wrap"><div className="spinner" /><span>Loading...</span></div>

  const topStates = [...stateData].sort((a, b) => b.total_responses - a.total_responses).slice(0, 15)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><FiMap style={{ marginRight: '8px' }} /> State & Language Analysis</h1>
        <p className="page-subtitle">Helpfulness scores broken down by geography and farmer language</p>
      </div>

      {/* Language Stats — click to filter GDB by language */}
      <div className="stat-grid mb-6">
        {langData.slice(0, 5).map(l => (
          <div
            key={l.name}
            className="stat-card clickable"
            style={{ '--accent-color': 'var(--purple-500)', '--icon-bg': 'rgba(168,85,247,0.12)' } as any}
            onClick={() => navigate(`/gdb-entries?language=${encodeURIComponent(l.name)}`)}
            title={`View ${l.name} GDB entries`}
          >
            <div className="stat-icon"><FiMessageCircle /></div>
            <div className="stat-value" style={{
              fontSize: '1.5rem',
              color: l.helpfulness_score >= 60 ? 'var(--green-400)' : l.helpfulness_score >= 40 ? 'var(--amber-400)' : 'var(--red-400)'
            }}>
              {l.helpfulness_score.toFixed(1)}%
            </div>
            <div className="stat-label">{l.name}</div>
            <div className="stat-sub">{l.total_responses} responses — click to browse</div>
          </div>
        ))}
      </div>

      <div className="grid-2 mb-6">
        {/* Language Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FiBarChart2 style={{ marginRight: '6px' }} /> Helpfulness by Language</span>
            <span className="badge badge-lang">{langData.length} Languages</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[...langData].sort((a,b) => b.helpfulness_score - a.helpfulness_score)}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="helpfulness_score" radius={[4, 4, 0, 0]} name="Score">
                  {langData.map(l => (
                    <Cell
                      key={l.name}
                      fill={l.helpfulness_score >= 60 ? '#22c55e' : l.helpfulness_score >= 40 ? '#f59e0b' : '#ef4444'}
                      opacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* State Volume Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FiMapPin style={{ marginRight: '6px' }} /> Top States by Volume</span>
            <span className="badge badge-domain">{stateData.length} States</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topStates.slice(0, 10)} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="helpful_count" stackId="a" fill="#22c55e" name="Helpful" />
                <Bar dataKey="not_helpful_count" stackId="a" fill="#ef4444" name="Not Helpful" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Full State Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title"><FiList style={{ marginRight: '6px' }} /> State-wise Breakdown</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>State</th>
                <th>Responses</th>
                <th>Helpful</th>
                <th>Not Helpful</th>
                <th style={{ minWidth: 180 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {stateData.map(s => (
                <tr
                  key={s.name}
                  className="tr-clickable"
                  onClick={() => navigate(`/gdb-entries?state=${encodeURIComponent(s.name)}`)}
                  title={`Browse entries from ${s.name}`}
                >
                  <td style={{ fontWeight: 500 }}>{s.name || 'Unknown'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{s.total_responses}</td>
                  <td style={{ color: 'var(--green-400)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiThumbsUp size={12} /> {s.helpful_count}</span>
                  </td>
                  <td style={{ color: 'var(--red-400)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiThumbsDown size={12} /> {s.not_helpful_count}</span>
                  </td>
                  <td style={{ minWidth: 180 }}><ScoreBar score={s.helpfulness_score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Language Table */}
      <div className="card mt-4">
        <div className="card-header">
          <span className="card-title"><FiMessageCircle style={{ marginRight: '6px' }} /> Language Breakdown</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Language</th>
                <th>Responses</th>
                <th>Helpful</th>
                <th>Not Helpful</th>
                <th style={{ minWidth: 180 }}>Score</th>
              </tr>
            </thead>
            <tbody>
              {langData.map(l => (
                <tr
                  key={l.name}
                  className="tr-clickable"
                  onClick={() => navigate(`/gdb-entries?language=${encodeURIComponent(l.name)}`)}
                  title={`Browse ${l.name} entries`}
                >
                  <td><span className="badge badge-lang">{l.name || 'Unknown'}</span></td>
                  <td style={{ color: 'var(--text-secondary)' }}>{l.total_responses}</td>
                  <td style={{ color: 'var(--green-400)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiThumbsUp size={12} /> {l.helpful_count}</span>
                  </td>
                  <td style={{ color: 'var(--red-400)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiThumbsDown size={12} /> {l.not_helpful_count}</span>
                  </td>
                  <td style={{ minWidth: 180 }}><ScoreBar score={l.helpfulness_score} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
