import { useEffect, useState } from 'react'
import { getDigest } from '../api'
import RateBar from '../components/RateBar'
import ErrorMessage from '../components/ErrorMessage'

export default function Digest() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [topN, setTopN] = useState(20)
  const [minResponses, setMinResponses] = useState(1)
  const [applied, setApplied] = useState({ topN: 20, minResponses: 1 })

  const load = async (n: number, m: number) => {
    setLoading(true)
    setError('')
    try {
      const res = await getDigest(n, m)
      setData(res.data)
    } catch {
      setError('Could not load digest')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(applied.topN, applied.minResponses)
  }, [applied])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-green-800 mb-2">Weekly Digest</h1>
      <p className="text-gray-500 text-sm mb-6">
        Ranked list of worst-performing GDB entries — for the agri team
      </p>

      {/* Summary header */}
      {data && !error && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-500">Generated at</p>
            <p className="font-bold text-gray-800 text-sm mt-1">
              {new Date(data.generated_at).toLocaleString()}
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-600">Entries analysed</p>
            <p className="font-bold text-blue-800 text-2xl mt-1">{data.total_entries_analysed}</p>
          </div>
          <div className={`border rounded-lg p-4 ${
            data.entries_below_threshold > 0
              ? 'bg-red-50 border-red-200'
              : 'bg-green-50 border-green-200'
          }`}>
            <p className={`text-sm ${data.entries_below_threshold > 0 ? 'text-red-600' : 'text-green-600'}`}>
              Below 60% threshold
            </p>
            <p className={`font-bold text-2xl mt-1 ${data.entries_below_threshold > 0 ? 'text-red-700' : 'text-green-700'}`}>
              {data.entries_below_threshold}
            </p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Show top N entries</label>
            <input
              type="number"
              value={topN}
              onChange={e => setTopN(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
              min={1}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Responses</label>
            <input
              type="number"
              value={minResponses}
              onChange={e => setMinResponses(Number(e.target.value))}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-28"
              min={1}
            />
          </div>
          <button
            onClick={() => setApplied({ topN, minResponses })}
            className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Loading digest...</p>
      ) : error ? (
        <ErrorMessage />
      ) : data?.entries.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <p className="text-yellow-700 font-medium">No entries to show</p>
          <p className="text-yellow-600 text-sm mt-1">
            Try lowering min responses or submit more feedback via the Test Panel
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {data?.entries.map((entry: any) => (
            <div key={entry.answer_id} className="bg-white border border-gray-200 rounded-lg p-4 flex items-center gap-4">
              <div className={`text-2xl font-bold w-10 text-center shrink-0 ${
                entry.rank === 1 ? 'text-red-600' :
                entry.rank === 2 ? 'text-orange-500' :
                entry.rank === 3 ? 'text-yellow-500' : 'text-gray-400'
              }`}>
                #{entry.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">{entry.domain}</span>
                  <span className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded">{entry.state}</span>
                  <span className="bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded">{entry.total_responses} responses</span>
                </div>
                <p className="text-xs text-gray-400 font-mono truncate">{entry.answer_id}</p>
              </div>
              <div className="w-48 shrink-0">
                <RateBar rate={entry.helpfulness_rate} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
