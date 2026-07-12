import { useEffect, useState } from 'react'
import { getFlagged } from '../api'
import RateBar from '../components/RateBar'

export default function Flagged() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [threshold, setThreshold] = useState(60)
  const [minResponses, setMinResponses] = useState(3)
  const [applied, setApplied] = useState({ threshold: 60, minResponses: 3 })

  const load = async (t: number, m: number) => {
    setLoading(true)
    try {
      const res = await getFlagged(t, m)
      setData(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(applied.threshold, applied.minResponses)
  }, [applied])

  const handleApply = () => {
    setApplied({ threshold, minResponses })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-green-800 mb-2">Flagged Entries</h1>
      <p className="text-gray-500 text-sm mb-6">
        GDB answers performing below the helpfulness threshold
      </p>

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Threshold (%)
            </label>
            <input
              type="number"
              value={threshold}
              onChange={e => setThreshold(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
              min={0}
              max={100}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Min Responses
            </label>
            <input
              type="number"
              value={minResponses}
              onChange={e => setMinResponses(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
              min={1}
            />
          </div>
          <button
            onClick={handleApply}
            className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Apply
          </button>

          {data && (
            <div className={`ml-auto px-4 py-2 rounded-lg text-sm font-bold ${
              data.flagged_count > 0
                ? 'bg-red-100 text-red-700'
                : 'bg-green-100 text-green-700'
            }`}>
              {data.flagged_count > 0
                ? `⚠️ ${data.flagged_count} entries flagged`
                : '✅ No entries flagged'}
            </div>
          )}
        </div>
        {data && (
          <p className="text-xs text-gray-400 mt-2">
            Using threshold: {data.threshold_used}% · Min responses: {data.min_responses_used}
          </p>
        )}
      </div>

      {/* Results */}
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : data?.flagged_count === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <p className="text-green-700 font-medium text-lg">✅ No entries flagged</p>
          <p className="text-green-600 text-sm mt-1">
            All answers with {data.min_responses_used}+ responses are above {data.threshold_used}% helpfulness
          </p>
          <p className="text-gray-400 text-xs mt-3">
            Try lowering the threshold or min responses to see results with current data
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Answer ID</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Domain</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Responses</th>
                <th className="px-4 py-3 font-medium text-gray-600 w-48">Helpfulness Rate</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Reason</th>
              </tr>
            </thead>
            <tbody>
              {data?.entries.map((entry: any, i: number) => (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">
                    {entry.answer_id.slice(0, 16)}...
                  </td>
                  <td className="px-4 py-3">{entry.domain}</td>
                  <td className="px-4 py-3 text-right">{entry.total_responses}</td>
                  <td className="px-4 py-3">
                    <RateBar rate={entry.helpfulness_rate} />
                  </td>
                  <td className="px-4 py-3 text-xs text-red-600">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
