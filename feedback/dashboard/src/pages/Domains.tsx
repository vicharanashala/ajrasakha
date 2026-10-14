import { useEffect, useState } from 'react'
import { getDashboard } from '../api'
import StatsChart from '../components/StatsChart'

export default function Domains() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard()
      .then(res => setData(res.data.by_domain))
      .catch(() => setError('Could not load domain data'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-green-800 mb-2">Domains</h1>
      <p className="text-gray-500 text-sm mb-6">Helpfulness rate per agricultural domain</p>
      {loading ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <StatsChart data={data} labelKey="domain" title="Domain Breakdown" error={error} />
      )}
    </div> 
  )
}
