import { useState, useEffect } from 'react'
import { submitFeedback, getAllFeedback } from '../api'
import axios from 'axios'

const LANGUAGES = ['hindi', 'english', 'kannada', 'tamil', 'punjabi', 'telugu']

export default function TestPanel() {
  const [samples, setSamples] = useState<any[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)
  const [language, setLanguage] = useState('hindi')
  const [farmerPhone, setFarmerPhone] = useState('919876543210')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'success' | 'error'>('success')
  const [recent, setRecent] = useState<any[]>([])
  const [loadingSamples, setLoadingSamples] = useState(true)

  useEffect(() => {
    axios.get('http://localhost:8000/questions/sample')
      .then(res => setSamples(res.data.samples))
      .catch(() => setMessage('Could not load sample questions'))
      .finally(() => setLoadingSamples(false))
    refreshRecent()
  }, [])

  const refreshRecent = async () => {
    const res = await getAllFeedback()
    setRecent(res.data.slice(-10).reverse())
  }

  const handleSubmit = async (response: '1' | '2') => {
    if (samples.length === 0) {
      setMessage('No sample questions available')
      setMessageType('error')
      return
    }

    const selected = samples[selectedIdx]
    try {
      await submitFeedback({
        farmer_phone: farmerPhone,
        question_id: selected.question_id,
        answer_id: selected.answer_id,
        language,
        response
      })
      setMessage(response === '1'
        ? '✅ Helpful feedback recorded!'
        : '❌ Not helpful feedback recorded!')
      setMessageType('success')
      refreshRecent()
    } catch (e: any) {
      setMessage(`Error: ${e.response?.data?.detail || 'Something went wrong'}`)
      setMessageType('error')
    }
    setTimeout(() => setMessage(''), 4000)
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      {/* Warning */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
        <p className="font-bold text-yellow-800">⚠️ Test Panel — for development only</p>
        <p className="text-yellow-700 text-sm mt-1">
          This simulates the WhatsApp webhook. In production, farmers reply
          via WhatsApp and feedback is captured automatically.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="font-bold text-gray-800 mb-4">Simulate Farmer Feedback</h2>

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
                onChange={e => setSelectedIdx(Number(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                {samples.map((s, i) => (
                  <option key={i} value={i}>
                    [{s.domain} · {s.state}] {s.question_text}...
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-red-500 text-sm">No approved answers found in DB yet</p>
            )}
          </div>

          {/* Selected IDs (read only, for transparency) */}
          {samples.length > 0 && (
            <div className="bg-gray-50 rounded p-3 text-xs text-gray-500 font-mono">
              <p>question_id: {samples[selectedIdx]?.question_id}</p>
              <p>answer_id: {samples[selectedIdx]?.answer_id}</p>
            </div>
          )}

          {/* Language */}
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

          {/* Farmer phone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farmer Phone</label>
            <input
              value={farmerPhone}
              onChange={e => setFarmerPhone(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* Buttons */}
        <div className="flex gap-3 mt-6">
          <button
            onClick={() => handleSubmit('1')}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-lg text-lg"
          >
            ✅ Helpful
          </button>
          <button
            onClick={() => handleSubmit('2')}
            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-lg text-lg"
          >
            ❌ Not Helpful
          </button>
        </div>

        {message && (
          <p className={`mt-3 text-center font-medium ${messageType === 'success' ? 'text-green-700' : 'text-red-600'}`}>
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
                  <p className="text-xs text-gray-500">{f.language || 'no language'} · {f.farmer_phone}</p>
                </div>
                <span className="text-lg">
                  {f.response === '1' ? '✅' : '❌'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
