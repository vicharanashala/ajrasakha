interface SparklineProps {
  points: number[];
  color: string;
}

export function Sparkline({ points, color }: SparklineProps) {
  if (!points || points.length === 0) {
    return null;
  }

  const max = Math.max(...points), min = Math.min(...points);
  const W = 120, H = 28;
  const px = (i: number) => {
    if (points.length <= 1) return W / 2;
    return (i / (points.length - 1)) * W;
  };
  const py = (v: number) => H - ((v - min) / (max - min || 1)) * H;

  const d = points.length === 1
    ? `M 0 ${py(points[0])} L ${W} ${py(points[0])}`
    : points.map((v, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(v)}`).join(" ");

  const fill = points.length === 1
    ? `M 0 ${py(points[0])} L ${W} ${py(points[0])} L ${W} ${H} L 0 ${H} Z`
    : d + ` L ${W} ${H} L 0 ${H} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[52px]" preserveAspectRatio="none">
      <path d={fill} fill={color} fillOpacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
