import { useEffect, useState } from 'react'
import { getStatus, getDashboard } from '../api'
import StatCard from '../components/StatCard'
import ErrorMessage from '../components/ErrorMessage'

export default function Overview() {
  const [status, setStatus] = useState('')
  const [dashboard, setDashboard] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      try {
        const [statusRes, dashRes] = await Promise.all([
          getStatus(),
          getDashboard()
        ])
        setStatus(statusRes.data.status)
        setDashboard(dashRes.data)
        setError('')
      } catch (e: any) {
        setError(e.message || 'Could not connect to API')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-green-800 mb-2">Overview</h1>
      <p className="text-gray-500 text-sm mb-6">
        Farmer feedback across all GDB entries
      </p>

      {loading ? (
        <p className="text-gray-400">Loading dashboard...</p>
      ) : error ? (
        <ErrorMessage />
      ) : (
        <>
          {/* API Status */}
          <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 mb-6 inline-block">
            <p className="text-green-700 text-sm">✅ {status}</p>
          </div>

          {dashboard?.total_responses === 0 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
              <p className="text-yellow-700 font-medium text-lg">No feedback data yet</p>
              <p className="text-yellow-600 text-sm mt-1">
                Go to the <span className="font-bold">Test Panel</span> to submit some feedback,
                or run <span className="font-mono bg-yellow-100 px-1 rounded">python3 seed.py</span> to seed demo data.
              </p>
            </div>
          ) : (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <StatCard
                  label="Total Responses"
                  value={dashboard.total_responses}
                  color="gray"
                />
                <StatCard
                  label="Helpful"
                  value={dashboard.overall_helpful}
                  sub={`${dashboard.overall_helpfulness_rate}% rate`}
                  color="green"
                />
                <StatCard
                  label="Not Helpful"
                  value={dashboard.overall_not_helpful}
                  color="red"
                />
                <StatCard
                  label="Overall Rate"
                  value={`${dashboard.overall_helpfulness_rate}%`}
                  sub={dashboard.overall_helpfulness_rate >= 60 ? '✅ Above threshold' : '⚠️ Below threshold'}
                  color="blue"
                />
              </div>

              {/* Domain summary */}
              {dashboard.by_domain.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <h2 className="font-bold text-gray-700 mb-3">By Domain</h2>
                  <div className="flex flex-col gap-2">
                    {dashboard.by_domain.map((d: any) => (
                      <div key={d.domain} className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 w-40 truncate">{d.domain}</span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full ${d.helpfulness_rate >= 60 ? 'bg-green-500' : 'bg-red-400'}`}
                            style={{ width: `${d.helpfulness_rate}%` }}
                          />
                        </div>
                        <span className="text-sm font-bold w-12 text-right text-gray-700">
                          {d.helpfulness_rate}%
                        </span>
                        <span className="text-xs text-gray-400 w-16 text-right">
                          {d.total} responses
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
