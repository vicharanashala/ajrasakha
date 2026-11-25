import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import Heatmap from './components/Heatmap.jsx'
import GapTable from './components/GapTable.jsx'
import Outreach from './components/Outreach.jsx'
import Spark from './components/Spark.jsx'
import TrendChart from './components/TrendChart.jsx'

const TABS = [
  ['report', 'Weekly gap report'],
  ['heatmap', 'Coverage heatmap'],
  ['outreach', 'Outreach planning'],
]

export default function App() {
  const [tab, setTab] = useState('report')
  const [report, setReport] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [showTrend, setShowTrend] = useState(false)

  const load = useCallback(() => {
    setError(null)
    api.report().then(setReport).catch((e) => setError(e.message))
  }, [])
  useEffect(load, [load])
  // pick up scheduled (every-2-hours) runs without a manual page reload
  useEffect(() => {
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  const rerun = async () => {
    setBusy(true)
    try {
      await api.run()
      load()
    } finally {
      setBusy(false)
    }
  }

  const s = report?.summary
  const history = s?.weekly_history || (s?.weekly_totals || []).map((n) => ({ week_start: '', unanswered: n, total: n }))
  const last7 = history.length ? history[history.length - 1].unanswered : 0

  return (
    <div className="app">
      <header>
        <div>
          <h1>GDB Coverage Gap Detector</h1>
          {report && (
            <p className="sub" title="Time the pipeline last ran">
              Last refreshed: <b>{fmt(report.run_at)}</b>
              {report.generated_at && <> · data up to <b>{fmt(report.generated_at, true)}</b></>}
            </p>
          )}
        </div>
        <div className="actions">
          <a className="btn" href={api.csvUrl}>Export CSV</a>
          <a className="btn" href={api.mdUrl} target="_blank" rel="noreferrer">Markdown</a>
          <button className="btn primary" onClick={rerun} disabled={busy}>{busy ? 'Running…' : 'Re-run pipeline'}</button>
        </div>
      </header>

      {error && <div className="card error">{error}. Start the API and run the pipeline, then reload.</div>}

      {s && (
        <section className="kpis">
          <Kpi label="Disclaimer-triggered queries" value={s.disclaimer_queries} />
          <Kpi label="Still unanswered" value={s.open_gaps} tone="bad" />
          <Kpi label="Question types (clusters)" value={s.clusters_ranked} />
          <Kpi label="Growing / emerging" value={s.growing_clusters} tone="warn" />
          <button type="button" className="kpi kpi-btn" aria-expanded={showTrend} aria-controls="trend-panel"
            onClick={() => setShowTrend((v) => !v)}>
            <span className="kpi-label">Weekly unanswered (8 wks) <span className="chev">{showTrend ? '▲' : '▼'}</span></span>
            <span className="kpi-row">
              <span className="kpi-value">{last7.toLocaleString()}</span>
              <Spark data={s.weekly_totals} width={110} height={34} />
            </span>
          </button>
        </section>
      )}

      {s && showTrend && (
        <section id="trend-panel" className="card trend">
          <div className="toolbar">
            <h2>Unanswered queries per week</h2>
            <span className="sub">{history.reduce((a, h) => a + h.unanswered, 0).toLocaleString()} unanswered across {history.length} weeks</span>
          </div>
          <TrendChart history={history} />
        </section>
      )}

      <nav className="tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
        ))}
      </nav>

      {report && tab === 'report' && <GapTable clusters={report.top_clusters} />}
      {report && tab === 'heatmap' && <Heatmap />}
      {report && tab === 'outreach' && <Outreach rows={report.outreach} clusters={report.top_clusters} />}
    </div>
  )
}

function fmt(iso, dateOnly = false) {
  if (!iso) return 'not recorded (re-run the pipeline)'
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
  return dateOnly
    ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function Kpi({ label, value, tone }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <span className={`kpi-value ${tone || ''}`}>{value.toLocaleString()}</span>
    </div>
  )
}
