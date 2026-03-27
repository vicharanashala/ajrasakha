interface Segment {
  label: string;
  pct: number;
  color: string;
}

interface DonutChartProps {
  segments: Segment[];
}

// Example data for demonstration
export const channelSegmentExample: Segment[] = [
  { label: "Voice", pct: 61, color: "#3AAA5A" },
  { label: "Text app", pct: 24, color: "#378ADD" },
];

export function DonutChart({ segments }: DonutChartProps) {
  const total = segments.reduce((s, x) => s + x.pct, 0);
  let offset = 0;
  const r = 30, cx = 40, cy = 40, circ = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3">
      <svg width={80} height={80} viewBox="0 0 80 80">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#f0f0f0" strokeWidth={14} />
        {segments.map((seg) => {
          const dash = (seg.pct / total) * circ;
          const el = (
            <circle key={seg.label} cx={cx} cy={cy} r={r} fill="none" stroke={seg.color} strokeWidth={14}
              strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} transform={`rotate(-90 ${cx} ${cy})`} />
          );
          offset += dash;
          return el;
        })}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={11} fontWeight={500} fill="#1E7A3C">{segments[0].pct}%</text>
      </svg>
      <div className="flex flex-col gap-1.5">
        {segments.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-sm flex-shrink-0 inline-block" style={{ background: s.color }} />{s.label} · {s.pct}%
          </div>
        ))}
      </div>
    </div>
  );
}
