import { cn } from "@/lib/utils";

interface KnowledgeAwarenessChartsProps {
  userMetricesData: any;
  hovered: string | null;
  setHovered: (value: string | null) => void;
  agriHovered: string | null;
  setAgriHovered: (value: string | null) => void;
}

interface ChartData {
  label: string;
  data: Array<{ count: number }>;
  hovered: string | null;
  setHover: (value: string | null) => void;
  color: string;
  gradId: string;
}

/**
 * Knowledge & Awareness Charts Component
 * Displays KCC Awareness and Agricultural App Usage donut charts
 */
export function KnowledgeAwarenessCharts({
  userMetricesData,
  hovered,
  setHovered,
  agriHovered,
  setAgriHovered,
}: KnowledgeAwarenessChartsProps) {
  const charts: ChartData[] = [
    {
      label: "KCC Awareness",
      data: userMetricesData?.kccAndAgriAppUsage?.kccAwareness || [],
      hovered,
      setHover: setHovered,
      color: "hsl(142 71% 45%)",
      gradId: "kccGrad",
    },
    {
      label: "Uses Agri Apps",
      data: userMetricesData?.kccAndAgriAppUsage?.agriAppUsage || [],
      hovered: agriHovered,
      setHover: setAgriHovered,
      color: "hsl(217 91% 60%)",
      gradId: "agriGrad",
    },
  ];

  return (
    <div className="flex flex-wrap gap-6 justify-center items-center h-[calc(100%-3rem)] overflow-hidden">
      {charts.map(({ label, data: d, hovered: h, setHover, color, gradId }) => {
        const yes = d?.[0]?.count || 0;
        const no = d?.[1]?.count || 0;
        const total = yes + no;
        const r = 45, cx = 60, cy = 60;
        const circ = 2 * Math.PI * r;
        const yesDash = total ? (yes / total) * circ : 0;
        const noDash = total ? (no / total) * circ : 0;
        const yesPct = total ? Math.round((yes / total) * 100) : 0;

        return (
          <div key={label} className="flex flex-col items-center gap-3 min-w-0 group/chart">
            <div className="relative">
              <svg viewBox="0 0 120 120" className="relative w-[120px] h-[120px]">
                <defs>
                  <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={color} stopOpacity="1" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.7" />
                  </linearGradient>
                </defs>
                <circle cx={cx} cy={cy} r={r} fill="none" className="stroke-muted" strokeWidth={10} />
                <circle
                  cx={cx} cy={cy} r={r} fill="none"
                  stroke={`url(#${gradId})`}
                  strokeWidth={h === "yes" ? 13 : 10}
                  strokeLinecap="round"
                  strokeDasharray={`${yesDash} ${circ}`}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  className="cursor-pointer transition-[stroke-width] duration-200"
                  onMouseEnter={() => setHover("yes")}
                  onMouseLeave={() => setHover(null)}
                />
                <circle
                  cx={cx} cy={cy} r={r} fill="none"
                  className="stroke-muted-foreground/40 cursor-pointer transition-[stroke-width] duration-200"
                  strokeWidth={h === "no" ? 13 : 10}
                  strokeLinecap="round"
                  strokeDasharray={`${noDash} ${circ}`}
                  strokeDashoffset={-yesDash}
                  transform={`rotate(-90 ${cx} ${cy})`}
                  onMouseEnter={() => setHover("no")}
                  onMouseLeave={() => setHover(null)}
                />
                <text x={cx} y={cy - 2} textAnchor="middle" className="fill-foreground font-bold tabular-nums" fontSize={h ? 16 : 20}>
                  {h === "yes" ? yes : h === "no" ? no : total}
                </text>
                <text x={cx} y={cy + 12} textAnchor="middle" className="fill-muted-foreground" fontSize={8} style={{ letterSpacing: "0.1em", textTransform: "uppercase" }}>
                  {h === "yes" ? "Yes" : h === "no" ? "No" : "Total"}
                </text>
              </svg>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-medium text-foreground">{label}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                {yesPct}% Yes
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default KnowledgeAwarenessCharts;