export default function Spark({ data, width = 90, height = 24 }) {
  if (!data?.length) return null
  const max = Math.max(...data, 1)
  const step = width / (data.length - 1 || 1)
  const pts = data.map((v, i) => `${(i * step).toFixed(1)},${(height - 3 - (v / max) * (height - 6)).toFixed(1)}`)
  const last = pts[pts.length - 1].split(',')
  return (
    <svg width={width} height={height} role="img" aria-label={`Weekly counts: ${data.join(', ')}`}>
      <polyline points={pts.join(' ')} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill="var(--accent)" />
    </svg>
  )
}
