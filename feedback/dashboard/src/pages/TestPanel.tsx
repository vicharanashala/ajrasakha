import { useState } from 'react'
import { submitFeedback, getAllFeedback } from '../api'

const DOMAINS = ['weather', 'market', 'soil', 'schemes', 'greetings', 'gdb_query']
const LANGUAGES = ['hindi', 'english', 'kannada', 'tamil', 'punjabi', 'telugu']
const STATES = ['maharashtra', 'punjab', 'karnataka', 'tamil_nadu', 'gujarat', 'rajasthan']

export default function TestPanel() {
  const [form, setForm] = useState({
    farmer_phone: '919876543210',
    gdb_entry_id: 'GDB001',
    domain: 'weather',
    language: 'hindi',
    state: 'maharashtra',
  })
  const [message, setMessage] = useState('')
  const [recent, setRecent] = useState<any[]>([])

  const refreshRecent = async () => {
    const res = await getAllFeedback()
    setRecent(res.data.slice(-10).reverse())
  }

  const handleSubmit = async (response: '1' | '2') => {
    try {
      await submitFeedback({ ...form, response })
      setMessage(response === '1' ? '✅ Helpful feedback recorded!' : '❌ Not helpful feedback recorded!')
      refreshRecent()
    } catch {
      setMessage('❌ Error submitting feedback')
    }
    setTimeout(() => setMessage(''), 3000)
  }

  const handleChange = (e: any) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Warning Banner */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4 mb-6">
        <p className="font-bold text-yellow-800">⚠️ Test Panel — for development only</p>
        <p className="text-yellow-700 text-sm mt-1">
          This simulates the WhatsApp webhook. In production, farmers reply
          via WhatsApp and feedback is captured automatically.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <h2 className="font-bold text-gray-800 mb-4">Simulate Farmer Feedback</h2>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GDB Entry ID</label>
            <input
              name="gdb_entry_id"
              value={form.gdb_entry_id}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="e.g. GDB001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Farmer Phone</label>
            <input
              name="farmer_phone"
              value={form.farmer_phone}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Domain</label>
            <select name="domain" value={form.domain} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language</label>
            <select name="language" value={form.language} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <select name="state" value={form.state} onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
              {STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {/* Submit Buttons */}
        <div className="flex flex-col md:flex-row gap-3 mt-6">
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
          <p className="mt-3 text-center font-medium text-gray-700">{message}</p>
        )}
      </div>

      {/* Recent Submissions */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-bold text-gray-800">Recent Submissions</h2>
          <button onClick={refreshRecent}
            className="text-sm text-green-700 hover:underline">
            Refresh
          </button>
        </div>

        {recent.length === 0 ? (
          <p className="text-gray-400 text-sm">No submissions yet. Submit feedback above!</p>
        ) : (
          <div className="flex flex-col gap-2">
            {recent.map((f: any) => (
              <div key={f.id} className="flex items-center justify-between border border-gray-100 rounded-lg p-3">
                <div>
                  <p className="font-medium text-sm">{f.gdb_entry_id}</p>
                  <p className="text-xs text-gray-500">{f.domain} · {f.language} · {f.state}</p>
                </div>
                <span className={`text-lg ${f.response === '1' ? 'text-green-600' : 'text-red-500'}`}>
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
