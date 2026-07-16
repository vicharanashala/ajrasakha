import { useEffect, useState } from 'react'
import { getFlaggedEntries, runFlaggingPipeline, updateFlagStatus } from '../client/api'
import {
  FiFlag, FiSearch, FiCheckCircle, FiThumbsUp, FiThumbsDown, FiEdit2, FiZap, FiSmile
} from 'react-icons/fi'

function FlaggedCard({ entry, onStatusChange }: { entry: any; onStatusChange: () => void }) {
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState('')
  const [showNotes, setShowNotes] = useState(false)

  const handleStatusChange = async (status: string) => {
    setLoading(true)
    try {
      await updateFlagStatus(entry.gdb_entry_id, status, notes || undefined)
      onStatusChange()
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const score = entry.helpfulness_score
  const scoreColor = score < 40 ? 'var(--red-400)' : score < 60 ? 'var(--amber-400)' : 'var(--green-400)'

  return (
    <div className="flagged-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div className="fc-score" style={{ color: scoreColor }}>{score.toFixed(1)}%</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>helpfulness score</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {entry.status === 'flagged' && <span className="badge badge-flagged"><FiFlag style={{ marginRight: '4px' }} /> Flagged</span>}
          {entry.status === 'under_review' && <span className="badge badge-review"><FiSearch style={{ marginRight: '4px' }} /> Under Review</span>}
          {entry.status === 'resolved' && <span className="badge badge-resolved"><FiCheckCircle style={{ marginRight: '4px' }} /> Resolved</span>}
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>
            Priority: {entry.priority_score?.toFixed(0)}
          </div>
        </div>
      </div>

      <code style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', display: 'block', marginBottom: '0.4rem' }}>
        {entry.gdb_entry_id}
      </code>

      <p className="fc-question">{entry.question}</p>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.6rem 0' }}>
        {entry.domain && <span className="badge badge-domain">{entry.domain}</span>}
        {entry.language && <span className="badge badge-lang">{entry.language}</span>}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <FiThumbsUp size={12} /> {entry.helpful_count} <span style={{ margin: '0 2px' }}><FiThumbsDown size={12} /></span> {entry.not_helpful_count} ({entry.total_responses} total)
        </span>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Flagged: {new Date(entry.flagged_at).toLocaleDateString()}
      </div>

      {showNotes && (
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add review notes..."
          style={{
            width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)',
            borderRadius: 6, color: 'var(--text-primary)', padding: '0.5rem', fontSize: '0.82rem',
            fontFamily: 'inherit', resize: 'vertical', minHeight: 60, marginBottom: '0.5rem'
          }}
        />
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {entry.status === 'flagged' && (
          <button className="btn btn-amber btn-sm" onClick={() => handleStatusChange('under_review')} disabled={loading}>
            <FiSearch style={{ marginRight: '4px' }} /> Mark Under Review
          </button>
        )}
        {entry.status !== 'resolved' && (
          <button className="btn btn-sm" style={{ background: 'var(--green-glow)', color: 'var(--green-400)', border: '1px solid rgba(34,197,94,0.2)' }}
            onClick={() => { setShowNotes(true); if (showNotes) handleStatusChange('resolved') }} disabled={loading}>
            <FiCheckCircle style={{ marginRight: '4px' }} /> {showNotes ? 'Confirm Resolve' : 'Resolve'}
          </button>
        )}
        {!showNotes && entry.status !== 'resolved' && (
          <button className="btn btn-secondary btn-sm" onClick={() => setShowNotes(v => !v)}>
            <FiEdit2 style={{ marginRight: '4px' }} /> Notes
          </button>
        )}
      </div>
    </div>
  )
}

export default function FlaggedEntries() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [pipelineMsg, setPipelineMsg] = useState('')
  const [statusFilter, setStatusFilter] = useState('flagged')

  const load = async () => {
    setLoading(true)
    try {
      const r = await getFlaggedEntries({ status: statusFilter })
      setData(r)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  useEffect(() => { load() }, [statusFilter])

  const handleRunPipeline = async () => {
    setPipelineLoading(true)
    try {
      const r = await runFlaggingPipeline()
      setPipelineMsg(`✅ Pipeline complete — ${r.newly_flagged} newly flagged, ${r.total_flagged} total flagged entries.`)
      load()
      setTimeout(() => setPipelineMsg(''), 6000)
    } catch (e) {
      setPipelineMsg('❌ Pipeline failed.')
    }
    setPipelineLoading(false)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><FiFlag style={{ marginRight: '8px' }} /> Flagged Entries</h1>
        <p className="page-subtitle">
          GDB entries with helpfulness score below 60% across 10+ responses — queued for expert re-review
        </p>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={handleRunPipeline} disabled={pipelineLoading}>
            {pipelineLoading ? '⏳ Running...' : <><FiZap style={{ marginRight: '4px' }} /> Run Flagging Pipeline</>}
          </button>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {(['flagged', 'under_review', 'resolved'] as const).map(s => (
              <button
                key={s}
                className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'flagged' ? <FiFlag style={{ marginRight: '4px' }} /> : s === 'under_review' ? <FiSearch style={{ marginRight: '4px' }} /> : <FiCheckCircle style={{ marginRight: '4px' }} />}
                {s.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        {pipelineMsg && (
          <div style={{ marginTop: '0.75rem', color: 'var(--green-400)', fontSize: '0.875rem' }}>
            {pipelineMsg}
          </div>
        )}
      </div>

      {/* Pipeline Info Box */}
      <div className="card mb-6" style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
        <div className="card-body" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Threshold</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--amber-400)' }}>{"<"} 60%</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Helpfulness score</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Min Responses</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--amber-400)' }}>10+</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Before flagging</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Flagged</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--red-400)' }}>{data?.total ?? '—'}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Entries in queue</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>How it works</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              After every farmer feedback, the system automatically checks if the GDB entry's score drops below the threshold.
              Flagged entries appear here for the agri team to review and improve. Once resolved, they're removed from the queue.
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="loading-wrap"><div className="spinner" /><span>Loading flagged entries...</span></div>
      ) : data?.data?.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon"><FiSmile size={48} color="var(--text-muted)" /></div>
          <p style={{ marginTop: '1rem' }}>No {statusFilter.replace('_', ' ')} entries found.</p>
          <p style={{ marginTop: '0.5rem' }}>
            {statusFilter === 'flagged' ? 'All GDB entries are performing well above threshold!' : 'Nothing here yet.'}
          </p>
        </div>
      ) : (
        <div className="flagged-grid">
          {data?.data?.map((e: any) => (
            <FlaggedCard key={e.gdb_entry_id} entry={e} onStatusChange={load} />
          ))}
        </div>
      )}
    </div>
  )
}
