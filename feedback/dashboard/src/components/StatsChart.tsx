import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Cell, ReferenceLine
} from 'recharts'

interface StatsChartProps {
  data: any[]
  labelKey: string
  title: string
  error?: string
}

export default function StatsChart({ data, labelKey, title, error }: StatsChartProps) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 font-medium">⚠️ Could not load data</p>
        <p className="text-red-500 text-sm mt-1">
          Make sure the backend is running on port 8000
        </p>
      </div>
    )
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
        <p className="text-yellow-700 font-medium">No data yet</p>
        <p className="text-yellow-600 text-sm mt-1">
          Submit feedback via the <span className="font-bold">Test Panel</span> or
          run <span className="font-mono bg-yellow-100 px-1 rounded">python3 seed.py</span>
        </p>
      </div>
    )
  }

  const chartData = data.map(d => ({
    name: d[labelKey],
    rate: d.helpfulness_rate,
    total: d.total,
    helpful: d.helpful,
    not_helpful: d.not_helpful,
  }))

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h2 className="font-bold text-gray-700 mb-4">{title}</h2>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 60 }}>
          <XAxis
            dataKey="name"
            angle={-35}
            textAnchor="end"
            tick={{ fontSize: 12 }}
          />
          <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                const d = payload[0].payload
                return (
                  <div className="bg-white border border-gray-200 rounded p-3 shadow text-sm">
                    <p className="font-bold mb-1">{label}</p>
                    <p>Total: {d.total}</p>
                    <p className="text-green-600">Helpful: {d.helpful}</p>
                    <p className="text-red-500">Not helpful: {d.not_helpful}</p>
                    <p className="font-bold mt-1">Rate: {d.rate}%</p>
                  </div>
                )
              }
              return null
            }}
          />
          <ReferenceLine
            y={60}
            stroke="#f59e0b"
            strokeDasharray="4 4"
            label={{ value: '60% threshold', position: 'right', fontSize: 11 }}
          />
          <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell
                key={index}
                fill={entry.rate >= 60 ? '#16a34a' : '#ef4444'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <table className="w-full mt-4 text-sm">
        <thead>
          <tr className="border-b text-gray-500">
            <th className="text-left py-2">{title.replace(' Breakdown', '')}</th>
            <th className="text-right py-2">Total</th>
            <th className="text-right py-2">Helpful</th>
            <th className="text-right py-2">Not Helpful</th>
            <th className="text-right py-2">Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d: any) => (
            <tr key={d[labelKey]} className="border-b hover:bg-gray-50">
              <td className="py-2 font-medium">{d[labelKey]}</td>
              <td className="text-right py-2">{d.total}</td>
              <td className="text-right py-2 text-green-600">{d.helpful}</td>
              <td className="text-right py-2 text-red-500">{d.not_helpful}</td>
              <td className={`text-right py-2 font-bold ${d.helpfulness_rate >= 60 ? 'text-green-600' : 'text-red-500'}`}>
                {d.helpfulness_rate}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
