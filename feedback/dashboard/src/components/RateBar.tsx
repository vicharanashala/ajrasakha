interface RateBarProps {
  rate: number
}

export default function RateBar({ rate }: RateBarProps) {
  const color = rate >= 60 ? 'bg-green-500' : rate >= 40 ? 'bg-orange-400' : 'bg-red-500'
  const textColor = rate >= 60 ? 'text-green-700' : rate >= 40 ? 'text-orange-600' : 'text-red-600'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-2">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className={`text-sm font-bold w-12 text-right ${textColor}`}>
        {rate}%
      </span>
    </div>
  )
}
