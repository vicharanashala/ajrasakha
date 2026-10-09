import { useState, useRef, useEffect } from 'react'
import { simulateWhatsApp, submitFeedback } from '../client/api'
import {
  FiSmartphone, FiSend, FiZap, FiChevronRight, FiBookOpen,
  FiThumbsUp, FiThumbsDown, FiCpu, FiMessageSquare, FiCheckCircle
} from 'react-icons/fi'

interface Message {
  id: string
  from: 'bot' | 'farmer'
  text: string
  time: string
}

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const QUICK_QUESTIONS = [
  'How to control powdery mildew in grapes?',
  'What is the best treatment for rice blast?',
  'Drip irrigation scheduling for sugarcane',
  'Cotton leaf curl virus treatment',
  'My wheat crop has yellow spots, what to do?',
]

export default function WhatsAppSim() {
  const [phone, setPhone] = useState('+919876543210')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '0',
      from: 'bot',
      text: '*Ajrasakha* — Your Agricultural Assistant\n\nAsk me any farming question and I\'ll find the best answer from our expert knowledge base.\n\nAfter I answer, I\'ll ask: *"Was this helpful? Reply 1 for Yes, 2 for No"*',
      time: now(),
    }
  ])
  const [loading, setLoading] = useState(false)
  const [awaitingFeedback, setAwaitingFeedback] = useState(false)
  const [lastGdbId, setLastGdbId] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState('')
  const msgEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const addMsg = (from: 'bot' | 'farmer', text: string) => {
    setMessages(prev => [...prev, { id: Date.now().toString(), from, text, time: now() }])
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return
    const msg = input.trim()
    setInput('')
    addMsg('farmer', msg)

    setLoading(true)
    try {
      const result = await simulateWhatsApp(phone, msg)

      if (result.type === 'feedback_captured') {
        const helpful = result.response === '1'
        addMsg('bot',
          `${helpful ? 'Thank you! Glad it was helpful!' : 'Thanks for your feedback!'}\n\n` +
          `Updated helpfulness score: *${result.new_score?.toFixed(1) || '—'}%*\n` +
          `Total responses: ${result.total_responses || '—'}\n` +
          `${result.is_flagged ? 'This entry has been flagged for review.' : 'This entry is performing well.'}`
        )
        setAwaitingFeedback(false)
        setFeedbackMsg(helpful ? 'Helpful response recorded!' : 'Feedback noted — this entry may be flagged for review.')
        setTimeout(() => setFeedbackMsg(''), 4000)
        setLastGdbId(null)
      } else if (result.type === 'answer_delivered') {
        addMsg('bot',
          `*Answer to your question:*\n\n${result.answer}\n\n_Domain: ${result.domain || 'Agriculture'}_\n_Source: Ajrasakha Expert Knowledge Base_`
        )
        setTimeout(() => {
          addMsg('bot', 'Was this helpful?\n\n*Reply 1* for Yes\n*Reply 2* for No\n\n_Your feedback improves answers for all farmers._')
          setAwaitingFeedback(true)
          setLastGdbId(result.gdb_entry_id)
        }, 800)
      } else {
        addMsg('bot', result.message || 'Sorry, I could not find an answer. Please try rephrasing.')
      }
    } catch (e: any) {
      addMsg('bot', 'Connection error. Make sure the backend is running on port 8000.')
    }
    setLoading(false)
  }

  const handleQuickQuestion = (q: string) => {
    setInput(q)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFeedbackClick = (response: '1' | '2') => {
    setInput(response)
    setTimeout(() => {
      setInput('')
      addMsg('farmer', response)
      setLoading(true)
      simulateWhatsApp(phone, response).then(result => {
        const helpful = response === '1'
        addMsg('bot',
          `${helpful ? 'Thank you! Glad it was helpful!' : 'Thanks for your feedback!'}\n\n` +
          `Updated score: *${result.new_score?.toFixed(1) || '—'}%*\n` +
          `${result.is_flagged ? 'Entry flagged for expert review.' : 'Entry performing well.'}`
        )
        setAwaitingFeedback(false)
        setLastGdbId(null)
        setFeedbackMsg(helpful ? 'Helpful feedback recorded!' : 'Not helpful — may trigger re-review')
        setTimeout(() => setFeedbackMsg(''), 4000)
      }).catch(() => {}).finally(() => setLoading(false))
    }, 100)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title"><FiSmartphone style={{ marginRight: '8px' }} /> WhatsApp Simulator</h1>
        <p className="page-subtitle">
          Simulate the full farmer feedback flow — ask a question, get an answer, then rate it
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Phone Frame */}
        <div>
          {/* Phone Settings */}
          <div className="card mb-4">
            <div className="card-body" style={{ padding: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.4rem' }}>
                Simulated Farmer Phone
              </div>
              <input
                className="filter-input"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                style={{ width: '100%' }}
                placeholder="+919876543210"
              />
              {feedbackMsg && (
                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: feedbackMsg.includes('Helpful') ? 'var(--green-400)' : 'var(--amber-400)' }}>
                  {feedbackMsg}
                </div>
              )}
            </div>
          </div>

          <div className="wa-phone-frame">
            <div className="wa-header">
              <div className="wa-avatar"><FiCpu size={20} /></div>
              <div className="wa-contact">
                <div className="wa-name">Ajrasakha Bot</div>
                <div className="wa-status">Online • Agricultural AI Assistant</div>
              </div>
            </div>

            <div className="wa-messages" id="wa-messages">
              {messages.map(msg => (
                <div key={msg.id} className={`wa-msg ${msg.from === 'bot' ? 'wa-msg-bot' : 'wa-msg-farmer'}`}>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>
                  <div className="wa-msg-time">
                    {msg.time}
                    {msg.from === 'farmer' && (
                      <span style={{ marginLeft: 3, color: '#53bdeb', display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                        <FiCheckCircle size={10} /><FiCheckCircle size={10} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="wa-msg wa-msg-bot">
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8696a0', animation: 'pulse-dot 1s ease-in-out infinite' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8696a0', animation: 'pulse-dot 1s ease-in-out infinite 0.2s' }} />
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#8696a0', animation: 'pulse-dot 1s ease-in-out infinite 0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={msgEndRef} />
            </div>

            {/* Feedback Quick Buttons */}
            {awaitingFeedback && (
              <div style={{ background: '#202c33', padding: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'center', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <button
                  onClick={() => handleFeedbackClick('1')}
                  style={{ flex: 1, background: 'rgba(37,211,102,0.15)', border: '1px solid #25D366', borderRadius: 8, color: '#25D366', padding: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <FiThumbsUp /> 1 - Helpful
                </button>
                <button
                  onClick={() => handleFeedbackClick('2')}
                  style={{ flex: 1, background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: 8, color: '#ef4444', padding: '0.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                >
                  <FiThumbsDown /> 2 - Not Helpful
                </button>
              </div>
            )}

            <div className="wa-input-row">
              <input
                className="wa-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={awaitingFeedback ? 'Type 1 (helpful) or 2 (not helpful)...' : 'Ask a farming question...'}
                disabled={loading}
              />
              <button className="wa-send-btn" onClick={handleSend} disabled={loading || !input.trim()}>
                <FiSend />
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {/* Quick Questions */}
          <div className="card">
            <div className="card-header">
              <span className="card-title"><FiZap style={{ marginRight: '6px' }} /> Quick Questions</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click to use</span>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {QUICK_QUESTIONS.map(q => (
                <button
                  key={q}
                  className="btn btn-secondary"
                  style={{ textAlign: 'left', justifyContent: 'flex-start', fontSize: '0.82rem', padding: '0.5rem 0.75rem' }}
                  onClick={() => handleQuickQuestion(q)}
                >
                  <FiChevronRight style={{ marginRight: '6px' }} /> {q}
                </button>
              ))}
            </div>
          </div>

          {/* How It Works */}
          <div className="card">
            <div className="card-header">
              <span className="card-title"><FiBookOpen style={{ marginRight: '6px' }} /> How It Works</span>
            </div>
            <div className="card-body">
              {[
                { icon: '1', title: 'Ask a Question', desc: 'Farmer types any crop-related question in the WhatsApp chat' },
                { icon: '2', title: 'GDB Search', desc: 'System searches the Golden Dataset for a relevant expert-verified answer' },
                { icon: '3', title: 'Answer Delivered', desc: 'The best matching answer is sent to the farmer immediately' },
                { icon: '4', title: 'Feedback Prompt', desc: 'Bot follows up: "Was this helpful? Reply 1 for Yes, 2 for No"' },
                { icon: '5', title: 'Score Updated', desc: 'Helpfulness score for that GDB entry updates in real-time' },
                { icon: '6', title: 'Auto-Flagging', desc: 'If score drops below 60% over 10+ responses → entry is flagged for re-review' },
              ].map(step => (
                <div key={step.icon} style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-primary)', flexShrink: 0, marginTop: '2px' }}>{step.icon}</div>
                  <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{step.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
