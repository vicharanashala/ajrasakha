import { useEffect, useState, useCallback } from 'react'
import { getGDBEntries, getFilterOptions, submitFeedback } from '../client/api'
import { FiBook, FiRefreshCw, FiThumbsUp, FiThumbsDown, FiFlag, FiCheck } from 'react-icons/fi'

function HelpBar({ score }: { score: number }) {
  const cls = score >= 60 ? 'fill-high score-high' : score >= 40 ? 'fill-mid score-mid' : 'fill-low score-low'
  const [fill, bar] = cls.split(' ')
  return (
    <div className="helpfulness-bar-wrap">
      <div className="helpfulness-bar-bg">
        <div className={`helpfulness-bar-fill ${fill}`} style={{ width: `${Math.min(score, 100)}%` }} />
      </div>
      <span className={`helpfulness-score ${bar}`}>{score.toFixed(1)}%</span>
    </div>
  )
}

export default function GDBEntries() {
  const [data, setData] = useState<any>(null)
  const [filters, setFilters] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [domain, setDomain] = useState('')
  const [language, setLanguage] = useState('')
  const [state, setState] = useState('')
  const [isFlagged, setIsFlagged] = useState('')
  const [sortBy, setSortBy] = useState('helpfulness_score')
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [submitMsg, setSubmitMsg] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: any = { page, limit: 50, sort_by: sortBy, sort_order: 1 }
      if (domain) params.domain = domain
      if (language) params.language = language
      if (state) params.state = state
      if (isFlagged !== '') params.is_flagged = isFlagged === 'true'
      const r = await getGDBEntries(params)
      setData(r)
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [page, domain, language, state, isFlagged, sortBy])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    getFilterOptions().then(setFilters).catch(() => {})
  }, [])

  const handleQuickFeedback = async (gdbId: string, response: '1' | '2') => {
    setSubmitting(gdbId + response)
    try {
      const r = await submitFeedback({ gdb_entry_id: gdbId, farmer_id: '+91test_admin', response })
      setSubmitMsg(`Feedback submitted! New score: ${r.updated_score?.toFixed(1)}%`)
      setTimeout(() => setSubmitMsg(''), 3000)
      load()
    } catch (e: any) {
      setSubmitMsg('Error: ' + (e?.response?.data?.detail || 'Unknown error'))
    }
    setSubmitting(null)
  }

  const totalPages = data ? Math.ceil(data.total / 50) : 1

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><FiBook style={{ marginRight: '8px' }} /> GDB Entries</h1>
        <p className="page-subtitle">
          {data ? `${data.total.toLocaleString()} entries` : 'Loading...'} — sorted by helpfulness score
        </p>
        {submitMsg && <div style={{ marginTop: '0.5rem', color: 'var(--green-400)', fontSize: '0.8rem' }}>{submitMsg}</div>}
      </div>

      {/* Filters */}
      <div className="filters-row">
        <select className="filter-select" value={domain} onChange={e => { setDomain(e.target.value); setPage(1) }}>
          <option value="">All Domains</option>
          {filters?.domains?.map((d: string) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="filter-select" value={language} onChange={e => { setLanguage(e.target.value); setPage(1) }}>
          <option value="">All Languages</option>
          {filters?.languages?.map((l: string) => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="filter-select" value={state} onChange={e => { setState(e.target.value); setPage(1) }}>
          <option value="">All States</option>
          {filters?.states?.map((s: string) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={isFlagged} onChange={e => { setIsFlagged(e.target.value); setPage(1) }}>
          <option value="">All Entries</option>
          <option value="true">Flagged Only</option>
          <option value="false">Not Flagged</option>
        </select>
        <select className="filter-select" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="helpfulness_score">Sort: Score (Low→High)</option>
          <option value="total_responses">Sort: Responses (Low→High)</option>
          <option value="not_helpful_count">Sort: Not Helpful (High)</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={load}><FiRefreshCw style={{ marginRight: '4px' }} /> Refresh</button>
      </div>

      {loading ? (
        <div className="loading-wrap"><div className="spinner" /><span>Loading entries...</span></div>
      ) : (
        <>
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>GDB ID</th>
                  <th style={{ minWidth: 280 }}>Question</th>
                  <th>Domain</th>
                  <th>Language</th>
                  <th>State</th>
                  <th style={{ minWidth: 160 }}>Helpfulness</th>
                  <th>Responses</th>
                  <th>Status</th>
                  <th>Quick Feedback</th>
                </tr>
              </thead>
              <tbody>
                {data?.data?.map((e: any) => (
                  <tr key={e.id}>
                    <td>
                      <code style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace' }}>
                        {e.id}
                      </code>
                    </td>
                    <td><div className="table-question" style={{ maxWidth: 280 }}>{e.question}</div></td>
                    <td><span className="badge badge-domain">{e.domain}</span></td>
                    <td><span className="badge badge-lang">{e.language}</span></td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{e.state}</td>
                    <td style={{ minWidth: 160 }}>
                      <HelpBar score={e.helpfulness_score || 0} />
                    </td>
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--green-400)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><FiThumbsUp size={12} /> {e.helpful_count}</span>{' '}
                      <span style={{ color: 'var(--red-400)', display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '6px' }}><FiThumbsDown size={12} /> {e.not_helpful_count}</span>
                    </td>
                    <td>
                      {e.is_flagged
                        ? <span className="badge badge-flagged"><FiFlag style={{ marginRight: '4px' }} /> Flagged</span>
                        : <span className="badge badge-healthy"><FiCheck style={{ marginRight: '4px' }} /> OK</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--green-glow)', color: 'var(--green-400)', border: '1px solid rgba(34,197,94,0.2)', padding: '0.25rem 0.5rem' }}
                          onClick={() => handleQuickFeedback(e.id, '1')}
                          disabled={submitting === e.id + '1'}
                        ><FiThumbsUp /></button>
                        <button
                          className="btn btn-sm"
                          style={{ background: 'var(--red-glow)', color: 'var(--red-400)', border: '1px solid rgba(239,68,68,0.2)', padding: '0.25rem 0.5rem' }}
                          onClick={() => handleQuickFeedback(e.id, '2')}
                          disabled={submitting === e.id + '2'}
                        ><FiThumbsDown /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="pagination">
            <button className="page-btn" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = i + 1
              return (
                <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => setPage(p)}>{p}</button>
              )
            })}
            {totalPages > 7 && <span style={{ color: 'var(--text-muted)' }}>...</span>}
            <button className="page-btn" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          </div>
        </>
      )}
    </div>
  )
}
