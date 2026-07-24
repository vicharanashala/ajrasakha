interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: 'green' | 'red' | 'blue' | 'gray'
}

const colorMap = {
  green: 'bg-green-50 border-green-200 text-green-700',
  red: 'bg-red-50 border-red-200 text-red-700',
  blue: 'bg-blue-50 border-blue-200 text-blue-700',
  gray: 'bg-gray-50 border-gray-200 text-gray-700',
}

export default function StatCard({ label, value, sub, color = 'gray' }: StatCardProps) {
  return (
    <div className={`border rounded-lg p-4 ${colorMap[color]}`}>
      <p className="text-sm font-medium opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-sm mt-1 opacity-60">{sub}</p>}
    </div>
  )
}
