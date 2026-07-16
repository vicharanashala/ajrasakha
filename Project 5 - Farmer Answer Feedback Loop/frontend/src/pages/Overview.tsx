import { useEffect, useState } from 'react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import {
  getOverview, getTrends, getTopBottom, runFlaggingPipeline, generateDigest,
} from '../client/api'
import {
  FiBarChart2, FiZap, FiCpu, FiMessageSquare, FiThumbsUp, FiFlag,
  FiBook, FiCalendar, FiTrendingUp, FiAward, FiAlertTriangle
} from 'react-icons/fi'

export default function Overview() {
  const [overview, setOverview] = useState<any>(null)
  const [trends, setTrends] = useState<any[]>([])
  const [topBottom, setTopBottom] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pipelineMsg, setPipelineMsg] = useState('')
  const [digestLoading, setDigestLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [ov, tr, tb] = await Promise.all([getOverview(), getTrends(30), getTopBottom(5)])
      setOverview(ov)
      setTrends(tr)
      setTopBottom(tb)
    } catch (e: any) {
      console.error(e)
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const handleRunPipeline = async () => {
    const r = await runFlaggingPipeline()
    setPipelineMsg(`✅ Pipeline ran — ${r.newly_flagged} newly flagged, ${r.total_flagged} total flagged`)
    load()
    setTimeout(() => setPipelineMsg(''), 5000)
  }

  const handleGenerateDigest = async () => {
    setDigestLoading(true)
    try {
      await generateDigest()
      setPipelineMsg('✅ Weekly digest generated! Go to Weekly Digest page to view it.')
      setTimeout(() => setPipelineMsg(''), 5000)
    } catch (e: any) {
      setPipelineMsg('❌ Digest generation failed. Check GROQ API key.')
    }
    setDigestLoading(false)
  }

  const scoreColor = (s: number) => s >= 60 ? 'var(--green-400)' : s >= 40 ? 'var(--amber-400)' : 'var(--red-400)'

  if (loading) return (
    <div className="loading-wrap">
      <div className="spinner" />
      <span>Loading dashboard...</span>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><FiBarChart2 style={{ marginRight: '8px' }} /> Feedback Overview</h1>
        <p className="page-subtitle">Real-time GDB helpfulness metrics from farmer interactions</p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleRunPipeline}><FiZap /> Run Flagging Pipeline</button>
          <button className="btn btn-secondary" onClick={handleGenerateDigest} disabled={digestLoading}>
            {digestLoading ? '⏳ Generating...' : <><FiCpu /> Generate Weekly Digest</>}
          </button>
          <button className="btn btn-secondary" onClick={load}>🔄 Refresh</button>
        </div>
        {pipelineMsg && <div style={{ marginTop: '0.75rem', color: 'var(--green-400)', fontSize: '0.875rem' }}>{pipelineMsg}</div>}
      </div>

      {/* KPI Stats */}
      <div className="stat-grid">
        <div className="stat-card" style={{ '--accent-color': 'var(--green-500)', '--icon-bg': 'var(--green-glow)' } as any}>
          <div className="stat-icon"><FiMessageSquare /></div>
          <div className="stat-value">{overview?.total_feedback?.toLocaleString() ?? 0}</div>
          <div className="stat-label">Total Feedback</div>
          <div className="stat-sub">Farmer responses captured</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': 'var(--green-500)', '--icon-bg': 'var(--green-glow)' } as any}>
          <div className="stat-icon"><FiThumbsUp /></div>
          <div className="stat-value" style={{ color: scoreColor(overview?.overall_helpfulness_score) }}>
            {overview?.overall_helpfulness_score?.toFixed(1) ?? 0}%
          </div>
          <div className="stat-label">Overall Helpfulness</div>
          <div className="stat-sub">{overview?.helpful_count?.toLocaleString()} helpful responses</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': 'var(--red-500)', '--icon-bg': 'var(--red-glow)' } as any}>
          <div className="stat-icon"><FiFlag /></div>
          <div className="stat-value" style={{ color: 'var(--red-400)' }}>{overview?.total_flagged ?? 0}</div>
          <div className="stat-label">Flagged Entries</div>
          <div className="stat-sub">Below 60% threshold</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': 'var(--blue-500)', '--icon-bg': 'rgba(59,130,246,0.12)' } as any}>
          <div className="stat-icon"><FiBook /></div>
          <div className="stat-value">{overview?.total_gdb_entries?.toLocaleString() ?? 0}</div>
          <div className="stat-label">GDB Entries</div>
          <div className="stat-sub">In knowledge base</div>
        </div>
        <div className="stat-card" style={{ '--accent-color': 'var(--amber-500)', '--icon-bg': 'var(--amber-glow)' } as any}>
          <div className="stat-icon"><FiCalendar /></div>
          <div className="stat-value" style={{ color: scoreColor(overview?.last_7_days_score) }}>
            {overview?.last_7_days_score?.toFixed(1) ?? 0}%
          </div>
          <div className="stat-label">7-Day Score</div>
          <div className="stat-sub">{overview?.last_7_days_total ?? 0} recent responses</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid-2 mb-6">
        {/* Trend Chart */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FiTrendingUp style={{ marginRight: '6px' }} /> Feedback Trend (30 days)</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={trends}>
                <defs>
                  <linearGradient id="helpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 8 }}
                  formatter={(v: any) => [`${v}%`, 'Helpfulness']}
                />
                <Area
                  type="monotone"
                  dataKey="helpfulness_score"
                  stroke="#22c55e"
                  strokeWidth={2}
                  fill="url(#helpGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Daily Volume */}
        <div className="card">
          <div className="card-header">
            <span className="card-title"><FiBarChart2 style={{ marginRight: '6px' }} /> Daily Volume (30 days)</span>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trends}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 8 }}
                />
                <Bar dataKey="helpful" stackId="a" fill="#22c55e" name="Helpful" radius={[0, 0, 0, 0]} />
                <Bar dataKey="not_helpful" stackId="a" fill="#ef4444" name="Not Helpful" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Top & Bottom Entries */}
      {topBottom && (
        <div className="grid-2">
          <div className="card">
            <div className="card-header">
              <span className="card-title"><FiAward style={{ marginRight: '6px', color: 'var(--amber-400)' }} /> Top 5 Best Performing</span>
              <span className="badge badge-healthy">High Quality</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Domain</th>
                    <th>Score</th>
                    <th>Responses</th>
                  </tr>
                </thead>
                <tbody>
                  {topBottom.top_entries.map((e: any) => (
                    <tr key={e.id}>
                      <td><div className="table-question">{e.question}</div></td>
                      <td><span className="badge badge-domain">{e.domain}</span></td>
                      <td><span style={{ color: 'var(--green-400)', fontWeight: 700 }}>{e.helpfulness_score.toFixed(1)}%</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>{e.total_responses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title"><FiAlertTriangle style={{ marginRight: '6px', color: 'var(--red-400)' }} /> Bottom 5 Worst Performing</span>
              <span className="badge badge-flagged">Needs Attention</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Domain</th>
                    <th>Score</th>
                    <th>Responses</th>
                  </tr>
                </thead>
                <tbody>
                  {topBottom.bottom_entries.map((e: any) => (
                    <tr key={e.id}>
                      <td><div className="table-question">{e.question}</div></td>
                      <td><span className="badge badge-domain">{e.domain}</span></td>
                      <td><span style={{ color: e.helpfulness_score < 40 ? 'var(--red-400)' : 'var(--amber-400)', fontWeight: 700 }}>{e.helpfulness_score.toFixed(1)}%</span></td>
                      <td style={{ color: 'var(--text-muted)' }}>{e.total_responses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
