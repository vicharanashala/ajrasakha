// Full weekly bar chart of unanswered queries (inline SVG, theme-aware).
const W = 900, H = 260, M = { l: 44, r: 12, t: 22, b: 36 }

function niceMax(v) {
  if (v <= 4) return 4
  const p = 10 ** Math.floor(Math.log10(v))
  return Math.ceil(v / p) * p
}

const label = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

export default function TrendChart({ history }) {
  if (!history?.length) return null
  const max = niceMax(Math.max(...history.map((h) => h.unanswered), 1))
  const iw = W - M.l - M.r, ih = H - M.t - M.b
  const slot = iw / history.length
  const bw = Math.min(slot * 0.7, 46)
  const y = (v) => M.t + ih - (v / max) * ih
  const every = Math.ceil(history.length / 12)
  const ticks = [0, 1, 2, 3, 4].map((i) => (max / 4) * i)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
      aria-label={`Unanswered queries per week: ${history.map((h) => `${label(h.week_start)} ${h.unanswered}`).join(', ')}`}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={M.l} x2={W - M.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth="1" />
          <text x={M.l - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="var(--mute)">{Math.round(t)}</text>
        </g>
      ))}
      {history.map((h, i) => {
        const x = M.l + slot * i + (slot - bw) / 2
        const top = y(h.unanswered)
        const isLast = i === history.length - 1
        return (
          <g key={h.week_start}>
            <title>{`Week of ${label(h.week_start)}: ${h.unanswered} unanswered (${h.total} total queries)`}</title>
            <rect x={x} y={top} width={bw} height={Math.max(M.t + ih - top, h.unanswered ? 1 : 0)} rx="3"
              fill="var(--accent)" opacity={isLast ? 1 : 0.7} />
            {history.length <= 24 && (
              <text x={x + bw / 2} y={top - 5} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--ink)">{h.unanswered}</text>
            )}
            {i % every === 0 && (
              <text x={x + bw / 2} y={H - 14} textAnchor="middle" fontSize="11" fill="var(--mute)">{label(h.week_start)}</text>
            )}
          </g>
        )
      })}
      <text x={M.l} y={12} fontSize="11" fill="var(--mute)">Unanswered queries per week (week starting)</text>
    </svg>
  )
}
