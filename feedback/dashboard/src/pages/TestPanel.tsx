import { useState, useEffect } from 'react'
import { submitFeedback, getAllFeedback } from '../api'
import axios from 'axios'

const LANGUAGES = ['hindi', 'english', 'kannada', 'tamil', 'punjabi', 'telugu']

const api = axios.create({ baseURL: 'http://localhost:8000' })

export default function TestPanel() {
  const [samples, setSamples] = useState<any[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [language, setLanguage] = useState('english')
  const [farmerPhone, setFarmerPhone] = useState('919876543210')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [recent, setRecent] = useState<any[]>([])
  const [loadingSamples, setLoadingSamples] = useState(true)
  const [pendingMessage, setPendingMessage] = useState('')
  const [hasPending, setHasPending] = useState(false)
  const [mode, setMode] = useState<'twostep' | 'direct'>('twostep')

  useEffect(() => {
    api.get('/questions/sample')
      .then(res => setSamples(res.data.samples))
      .catch(() => setMessage('Could not load sample questions'))
      .finally(() => setLoadingSamples(false))
    refreshRecent()
  }, [])

  const refreshRecent = async () => {
    const res = await getAllFeedback()
    setRecent(res.data.slice(-10).reverse())
  }

  const showMessage = (msg: string, type: 'success' | 'error') => {
    setMessage(msg)
    setMessageType(type)
    setTimeout(() => setMessage(''), 4000)
  }

  // Step 1: simulate answer delivery → creates pending feedback
  const handleDeliverAnswer = async () => {
    if (samples.length === 0) return
    const selected = samples[selectedIdx]
    try {
      const res = await api.post('/pending-feedback', {
        farmer_phone: farmerPhone,
        question_id: selected.question_id,
        answer_id: selected.answer_id,
      })
      setPendingMessage(res.data.message_text)
      setHasPending(true)
      showMessage(`✅ Answer delivered. Follow-up sent: "${res.data.message_text}"`, 'success')
    } catch (e: any) {
      showMessage(`Error: ${e.response?.data?.detail || 'Something went wrong'}`, 'error')
    }
  }

  // Step 2: simulate farmer replying 1 or 2
  const handleFarmerReply = async (response: '1' | '2') => {
    try {
      await api.post('/feedback/complete', {
        farmer_phone: farmerPhone,
        response,
      })
      showMessage(
        response === '1'
          ? '✅ Farmer replied: Helpful — feedback recorded!'
          : '❌ Farmer replied: Not Helpful — feedback recorded!',
        'success'
      )
      setHasPending(false)
      setPendingMessage('')
      refreshRecent()
    } catch (e: any) {
      showMessage(`Error: ${e.response?.data?.detail || 'Something went wrong'}`, 'error')
    }
  }

  // Direct mode: one-shot submit (original Test Panel behaviour)
  const handleDirectSubmit = async (response: '1' | '2') => {
    if (samples.length === 0) return
    const selected = samples[selectedIdx]
    try {
      await submitFeedback({
        farmer_phone: farmerPhone,
        question_id: selected.question_id,
        answer_id: selected.answer_id,
        language,
        response,
      })
      showMessage(
        response === '1' ? '✅ Helpful feedback recorded!' : '❌ Not helpful feedback recorded!',
        'success'
      )
      refreshRecent()
    } catch (e: any) {
      showMessage(`Error: ${e.response?.data?.detail || 'Something went wrong'}`, 'error')
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">

      {/* Warning */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
        <p className="font-bold text-yellow-800">⚠️ Test Panel — for development only</p>
        <p className="text-yellow-700 text-sm mt-1">
          Simulates the WhatsApp webhook. In production this happens automatically.
        </p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setMode('twostep')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
            mode === 'twostep'
              ? 'bg-green-700 text-white border-green-700'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          🔄 Two-step (WhatsApp flow)
        </button>
        <button
          onClick={() => setMode('direct')}
          className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
            mode === 'direct'
              ? 'bg-green-700 text-white border-green-700'
              : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
          }`}
        >
          ⚡ Direct submit
        </button>
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">

        {mode === 'twostep' ? (
          <>
            <h2 className="font-bold text-gray-800 mb-1">Simulate WhatsApp Flow</h2>
            <p className="text-gray-500 text-xs mb-4">
              Step 1: deliver answer → Step 2: farmer replies
            </p>
          </>
        ) : (
          <>
            <h2 className="font-bold text-gray-800 mb-1">Direct Feedback Submit</h2>
            <p className="text-gray-500 text-xs mb-4">
              Bypasses pending state — submits feedback in one shot
            </p>
          </>
        )}

        <div className="flex flex-col gap-4">

          {/* Question selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Question / Answer pair
            </label>
            {loadingSamples ? (
              <p className="text-gray-400 text-sm">Loading real questions from DB...</p>
            ) : samples.length > 0 ? (
              <select
                value={selectedIdx}
                onChange={e => {
                  setSelectedIdx(Number(e.target.value))
                  setHasPending(false)
                  setPendingMessage('')
                }}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {samples.map((s, i) => (
                  <option key={i} value={i}>
                    [{s.domain} · {s.state}] {s.question_text}...
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-red-500 text-sm">No approved answers found in DB</p>
            )}
          </div>

          {/* IDs */}
          {samples.length > 0 && (
            <div className="bg-gray-50 rounded p-3 text-xs text-gray-500 font-mono">
              <p>question_id: {samples[selectedIdx]?.question_id}</p>
              <p>answer_id: {samples[selectedIdx]?.answer_id}</p>
            </div>
          )}

          {/* Language (direct mode only) */}
          {mode === 'direct' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}

          {/* Farmer phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farmer Phone</label>
            <input
              value={farmerPhone}
              onChange={e => {
                setFarmerPhone(e.target.value)
                setHasPending(false)
                setPendingMessage('')
              }}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Two-step flow */}
        {mode === 'twostep' && (
          <div className="mt-6">
            {/* Step 1 */}
            <div className={`border rounded-lg p-4 mb-3 ${hasPending ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
              <p className="text-sm font-bold text-gray-700 mb-2">
                Step 1 — Deliver answer to farmer
              </p>
              <button
                onClick={handleDeliverAnswer}
                disabled={samples.length === 0}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-medium py-3 rounded-lg text-sm"
              >
                📤 Simulate Answer Delivery
              </button>
              {hasPending && pendingMessage && (
                <div className="mt-3 bg-white border border-green-200 rounded p-3">
                  <p className="text-xs text-gray-500 mb-1">Follow-up message sent to farmer:</p>
                  <p className="text-sm font-medium text-green-800">"{pendingMessage}"</p>
                </div>
              )}
            </div>

            {/* Step 2 */}
            <div className={`border rounded-lg p-4 ${!hasPending ? 'opacity-50' : 'border-gray-200'}`}>
              <p className="text-sm font-bold text-gray-700 mb-2">
                Step 2 — Farmer replies
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleFarmerReply('1')}
                  disabled={!hasPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg"
                >
                  ✅ Reply: 1 (Helpful)
                </button>
                <button
                  onClick={() => handleFarmerReply('2')}
                  disabled={!hasPending}
                  className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg"
                >
                  ❌ Reply: 2 (Not Helpful)
                </button>
              </div>
              {!hasPending && (
                <p className="text-xs text-gray-400 mt-2 text-center">
                  Complete Step 1 first
                </p>
              )}
            </div>
          </div>
        )}

        {/* Direct mode buttons */}
        {mode === 'direct' && (
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => handleDirectSubmit('1')}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg text-lg"
            >
              ✅ Helpful
            </button>
            <button
              onClick={() => handleDirectSubmit('2')}
              className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-lg text-lg"
            >
              ❌ Not Helpful
            </button>
          </div>
        )}

        {message && (
          <p className={`mt-3 text-center text-sm font-medium ${
            messageType === 'success' ? 'text-green-700' : 'text-red-600'
          }`}>
            {message}
          </p>
        )}
      </div>

      {/* Recent Submissions */}
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-gray-800">Recent Submissions</h2>
          <button onClick={refreshRecent} className="text-sm text-green-700 hover:underline">
            Refresh
          </button>
        </div>
        {recent.length === 0 ? (
          <p className="text-gray-400 text-sm">No submissions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((f: any, i) => (
              <div key={i} className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="font-medium text-sm">{f.domain} · {f.state}</p>
                  <p className="text-xs text-gray-500">{f.language || 'english'} · {f.farmer_phone}</p>
                </div>
                <span className="text-lg">{f.response === '1' ? '✅' : '❌'}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
