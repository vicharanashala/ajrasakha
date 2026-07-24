import { useEffect, useState } from 'react'
import { getDashboard } from '../api'
import StatsChart from '../components/StatsChart'

export default function States() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard()
      .then(res => setData(res.data.by_state))
      .catch(() => setError('Could not load state data'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-green-800 mb-2">States</h1>
      <p className="text-gray-500 text-sm mb-6">Helpfulness rate per state</p>
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <StatsChart data={data} labelKey="state" title="State Breakdown" error={error} />
      )}
    </div>
  )
}
