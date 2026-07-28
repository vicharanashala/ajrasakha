import { useEffect, useState } from 'react'
import {
  getFlaggedEntries, runFlaggingPipeline, updateFlagStatus,
  updateFlaggingSettings, editGDBEntry,
} from '../client/api'
import { useSettings } from '../context/SettingsContext'
import {
  FiFlag, FiSearch, FiCheckCircle, FiThumbsUp, FiThumbsDown,
  FiEdit2, FiZap, FiSettings, FiSave, FiX, FiAlertTriangle,
  FiMessageSquare, FiBook, FiRefreshCw, FiClock, FiXCircle, FiSmile,
  FiChevronDown, FiChevronUp,
} from 'react-icons/fi'

/* ─────────────────────────────────────────────────────────────
   Expert Edit Modal
───────────────────────────────────────────────────────────── */
function EditModal({ entry, onClose, onSaved }: { entry: any; onClose: () => void; onSaved: () => void }) {
  const [question, setQuestion] = useState(entry.question || '')
  const [answer, setAnswer] = useState(entry.answer || '')
  const [notes, setNotes] = useState(entry.review_notes || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    if (!question.trim() && !answer.trim()) { setError('Provide at least a question or an answer.'); return }
    setSaving(true); setError('')
    try {
      await editGDBEntry(entry.gdb_entry_id, {
        question: question.trim() || undefined,
        answer: answer.trim() || undefined,
        review_notes: notes.trim() || undefined,
      })
      onSaved(); onClose()
    } catch (e: any) { setError(e?.response?.data?.detail || 'Save failed.') }
    setSaving(false)
  }

  const textarea = (label: string, icon: any, value: string, onChange: (v: string) => void, rows: number, hint?: string) => (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {icon} {label} {hint && <span style={{ color: 'var(--amber-400)', fontWeight: 400, marginLeft: 4 }}>{hint}</span>}
      </label>
      <textarea value={value} onChange={e => onChange(e.target.value)} rows={rows}
        style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)', borderRadius: 8, color: 'var(--text-primary)', padding: '0.75rem 1rem', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.6, outline: 'none' }}
      />
    </div>
  )

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-xl)', width: '100%', maxWidth: 680, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-glass)' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '1rem' }}>
              <FiEdit2 color="var(--amber-400)" /> Expert Edit — GDB Entry
            </div>
            <code style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{entry.gdb_entry_id}</code>
          </div>
          <button onClick={onClose} style={{ background: 'var(--bg-glass)', border: '1px solid var(--border-glass)', borderRadius: 8, padding: '0.4rem 0.6rem', cursor: 'pointer', color: 'var(--text-secondary)' }}><FiX /></button>
        </div>
        <div style={{ padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '0.75rem 1rem', color: 'var(--red-400)', fontSize: '0.875rem' }}><FiAlertTriangle style={{ marginRight: 6 }} />{error}</div>}
          {textarea('Question', <FiMessageSquare size={12} />, question, setQuestion, 3)}
          {textarea('Answer', <FiBook size={12} />, answer, setAnswer, 7, '← Edit to improve GDB quality')}
          {textarea('Review Notes (optional)', <FiEdit2 size={12} />, notes, setNotes, 2)}
        </div>
        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ background: 'linear-gradient(135deg, var(--amber-500), #d97706)' }}>
            {saving ? <><FiClock style={{ marginRight: 6 }} /> Saving...</> : <><FiSave style={{ marginRight: 6 }} />Save Changes</>}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Settings Panel — inline threshold + min responses editor
───────────────────────────────────────────────────────────── */
function SettingsPanel({ onApplied }: { onApplied: () => void }) {
  const { settings, setSettings } = useSettings()
  const [threshold, setThreshold] = useState(String(settings.feedback_threshold))
  const [minResp, setMinResp] = useState(String(settings.min_responses_to_flag))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  // Keep local inputs in sync when context changes externally
  useEffect(() => { setThreshold(String(settings.feedback_threshold)) }, [settings.feedback_threshold])
  useEffect(() => { setMinResp(String(settings.min_responses_to_flag)) }, [settings.min_responses_to_flag])

  const handleApply = async () => {
    const t = parseFloat(threshold)
    const m = parseInt(minResp, 10)
    if (isNaN(t) || t <= 0 || t > 100) { setMsg('error:Threshold must be 1–100'); return }
    if (isNaN(m) || m < 1) { setMsg('error:Min responses must be ≥ 1'); return }

    setSaving(true); setMsg('')
    try {
      await updateFlaggingSettings({ feedback_threshold: t, min_responses_to_flag: m })
      setSettings({ feedback_threshold: t, min_responses_to_flag: m })
      setMsg('saving')
      const r = await runFlaggingPipeline()
      setMsg(`done:${r.newly_flagged} newly flagged, ${r.updated} updated. Threshold: ${t}%`)
      setTimeout(() => setMsg(''), 6000)
      onApplied()
    } catch (e: any) {
      setMsg(`error:${e?.response?.data?.detail || 'Save failed'}`)
    }
    setSaving(false)
  }

  return (
    <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 'var(--radius-lg)', padding: '1.25rem 1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem', fontWeight: 700, fontSize: '0.9rem', color: 'var(--amber-400)' }}>
        <FiSettings /> Flagging Settings
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400, marginLeft: 4 }}>
          Applies immediately — pipeline re-runs automatically to sync flagged entries
        </span>
      </div>
      <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Helpfulness Threshold (%)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={1} max={100} step={1} value={threshold} onChange={e => setThreshold(e.target.value)}
              className="filter-input"
              style={{ width: 90, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: 'var(--amber-400)' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>% (flag below this)</span>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Min Responses Before Flagging
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="number" min={1} step={1} value={minResp} onChange={e => setMinResp(e.target.value)}
              className="filter-input"
              style={{ width: 90, textAlign: 'center', fontWeight: 700, fontSize: '1.1rem', color: 'var(--amber-400)' }}
            />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>responses needed</span>
          </div>
        </div>
        <button className="btn btn-amber" onClick={handleApply} disabled={saving}>
          {saving ? <><FiClock style={{ marginRight: 4 }} />Applying...</> : <><FiSave style={{ marginRight: 4 }} />Apply &amp; Sync</>}
        </button>
      </div>
      {msg && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6,
          color: msg.startsWith('done:') ? 'var(--green-400)' : msg === 'saving' ? 'var(--amber-400)' : msg.startsWith('error:') ? 'var(--red-400)' : 'var(--amber-400)' }}>
          {msg.startsWith('done:') ? <FiCheckCircle /> : msg === 'saving' ? <FiClock /> : msg.startsWith('error:') ? <FiXCircle /> : <FiClock />}
          {msg === 'saving' ? 'Settings saved — re-running pipeline...' : msg.startsWith('done:') ? msg.replace('done:', '') : msg.startsWith('error:') ? msg.replace('error:', '') : msg}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Flagged Card
───────────────────────────────────────────────────────────── */
function FlaggedCard({ entry, onStatusChange, onEditClick }: { entry: any; onStatusChange: () => void; onEditClick: (e: any) => void }) {
  const [loading, setLoading] = useState(false)
  const [notes, setNotes] = useState(entry.review_notes || '')
  const [showNotes, setShowNotes] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const handleStatusChange = async (status: string) => {
    setLoading(true)
    try { await updateFlagStatus(entry.gdb_entry_id, status, notes || undefined); onStatusChange() }
    catch (e) { console.error(e) }
    setLoading(false)
  }

  const score = entry.helpfulness_score
  const scoreColor = score < 40 ? 'var(--red-400)' : score < 60 ? 'var(--amber-400)' : 'var(--green-400)'

  return (
    <div className="flagged-card clickable" onClick={() => setExpanded(v => !v)}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
        <div>
          <div className="fc-score" style={{ color: scoreColor }}>{score.toFixed(1)}%</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>helpfulness score</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ textAlign: 'right' }}>
            {entry.status === 'flagged' && <span className="badge badge-flagged"><FiFlag style={{ marginRight: '4px' }} /> Flagged</span>}
            {entry.status === 'under_review' && <span className="badge badge-review"><FiSearch style={{ marginRight: '4px' }} /> Under Review</span>}
            {entry.status === 'resolved' && <span className="badge badge-resolved"><FiCheckCircle style={{ marginRight: '4px' }} /> Resolved</span>}
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 4 }}>Priority: {entry.priority_score?.toFixed(0)}</div>
          </div>
          <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
            {expanded ? <FiChevronUp size={16} /> : <FiChevronDown size={16} />}
          </span>
        </div>
      </div>

      <code style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'JetBrains Mono, monospace', display: 'block', marginBottom: '0.4rem' }}>
        {entry.gdb_entry_id}
      </code>

      <p className="fc-question">{entry.question}</p>

      {/* Collapsed: show 2-line preview; Expanded: show full answer */}
      {entry.answer && (
        <p style={{
          fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0.35rem 0 0.6rem',
          lineHeight: 1.5, fontStyle: 'italic',
          ...(expanded ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any, overflow: 'hidden' })
        }}>
          {entry.answer}
        </p>
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', margin: '0.6rem 0' }}>
        {entry.domain && <span className="badge badge-domain">{entry.domain}</span>}
        {entry.language && <span className="badge badge-lang">{entry.language}</span>}
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <FiThumbsUp size={12} /> {entry.helpful_count} <span style={{ margin: '0 2px' }}><FiThumbsDown size={12} /></span> {entry.not_helpful_count} ({entry.total_responses} total)
        </span>
      </div>

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
        Flagged: {new Date(entry.flagged_at).toLocaleDateString()}
        {entry.review_notes && <div style={{ marginTop: 2, color: 'var(--amber-400)', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}><FiMessageSquare size={11} /> {entry.review_notes}</div>}
      </div>

      {showNotes && (
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add review notes..."
          style={{ width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border-glass)', borderRadius: 6, color: 'var(--text-primary)', padding: '0.5rem', fontSize: '0.82rem', fontFamily: 'inherit', resize: 'vertical', minHeight: 60, marginBottom: '0.5rem', outline: 'none' }}
        />
      )}

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }} onClick={ev => ev.stopPropagation()}>
        {entry.status !== 'resolved' && (
          <button className="btn btn-sm" style={{ background: 'rgba(245,158,11,0.12)', color: 'var(--amber-400)', border: '1px solid rgba(245,158,11,0.25)' }} onClick={() => onEditClick(entry)}>
            <FiEdit2 style={{ marginRight: '4px' }} /> Edit Q&amp;A
          </button>
        )}
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

/* ─────────────────────────────────────────────────────────────
   Main Page
───────────────────────────────────────────────────────────── */
export default function FlaggedEntries() {
  const { settings } = useSettings()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [pipelineLoading, setPipelineLoading] = useState(false)
  const [pipelineMsg, setPipelineMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [statusFilter, setStatusFilter] = useState('flagged')
  const [showSettings, setShowSettings] = useState(false)
  const [editEntry, setEditEntry] = useState<any>(null)

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
      setPipelineMsg({ type: 'success', text: `Pipeline complete — ${r.newly_flagged} newly flagged, ${r.updated} updated, ${r.total_flagged} total.` })
      load()
      setTimeout(() => setPipelineMsg(null), 6000)
    } catch (e) { setPipelineMsg({ type: 'error', text: 'Pipeline failed.' }) }
    setPipelineLoading(false)
  }

  return (
    <div>
      {editEntry && <EditModal entry={editEntry} onClose={() => setEditEntry(null)} onSaved={load} />}

      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="page-title"><FiFlag style={{ marginRight: '8px' }} /> Flagged Entries</h1>
            <p className="page-subtitle">
              GDB entries with helpfulness score below{' '}
              <strong style={{ color: 'var(--amber-400)' }}>{settings.feedback_threshold}%</strong>{' '}
              queued for expert re-review
            </p>
          </div>
          <div className="page-actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary" onClick={handleRunPipeline} disabled={pipelineLoading}>
              {pipelineLoading ? <><FiClock style={{ marginRight: '4px' }} /> Running...</> : <><FiZap style={{ marginRight: '4px' }} /> Run Pipeline</>}
            </button>
            <button className={`btn ${showSettings ? 'btn-amber' : 'btn-secondary'}`} onClick={() => setShowSettings(v => !v)}>
              <FiSettings style={{ marginRight: '4px' }} /> {showSettings ? 'Hide Settings' : 'Threshold Settings'}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={load}>
              <FiRefreshCw style={{ marginRight: '4px' }} /> Refresh
            </button>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {(['flagged', 'under_review', 'resolved'] as const).map(s => (
                <button key={s} className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setStatusFilter(s)}>
                  {s === 'flagged' ? <FiFlag style={{ marginRight: '4px' }} /> : s === 'under_review' ? <FiSearch style={{ marginRight: '4px' }} /> : <FiCheckCircle style={{ marginRight: '4px' }} />}
                  {s.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>
        {pipelineMsg && (
          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', color: pipelineMsg.type === 'success' ? 'var(--green-400)' : 'var(--red-400)' }}>
            {pipelineMsg.type === 'success' ? <FiCheckCircle /> : <FiXCircle />} {pipelineMsg.text}
          </div>
        )}
      </div>

      {showSettings && (
        <div style={{ marginBottom: '1.5rem' }}>
          <SettingsPanel onApplied={load} />
        </div>
      )}

      {/* Info Bar */}
      <div className="card mb-6" style={{ border: '1px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)' }}>
        <div className="card-body" style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Threshold</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--amber-400)' }}>{'<'} {settings.feedback_threshold}%</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Helpfulness score</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Min Responses</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--amber-400)' }}>{settings.min_responses_to_flag}+</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Before flagging</div>
          </div>
          <div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>In Queue</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--red-400)' }}>{data?.total ?? '—'}</div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Flagged entries</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>How it works</div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Change threshold via <strong style={{ color: 'var(--amber-400)' }}>Threshold Settings</strong> above — it auto-runs the pipeline and immediately syncs flagged entries across the whole site.
              Click <strong style={{ color: 'var(--amber-400)' }}>Edit Q&amp;A</strong> on any card to improve the GDB answer directly.
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
            {statusFilter === 'flagged' ? `All GDB entries score above ${settings.feedback_threshold}% — great quality!` : 'Nothing here yet.'}
          </p>
        </div>
      ) : (
        <div className="flagged-grid">
          {data?.data?.map((e: any) => (
            <FlaggedCard key={e.gdb_entry_id} entry={e} onStatusChange={load} onEditClick={setEditEntry} />
          ))}
        </div>
      )}
    </div>
  )
}
