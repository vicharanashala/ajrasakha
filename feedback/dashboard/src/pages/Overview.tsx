import { useEffect, useState } from 'react'
import { getStatus } from '../api'

export default function Overview() {
  const [status, setStatus] = useState('')

  useEffect(() => {
    getStatus().then(res => setStatus(res.data.status))
  }, [])

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold text-green-800 mb-4">Overview</h1>
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-green-700">✅ {status || 'Connecting to API...'}</p>
      </div>
    </div>
  )
}
