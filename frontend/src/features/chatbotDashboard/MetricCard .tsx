import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import { Card, CardContent } from "@/components/atoms/card";
import { Download, Smartphone, Apple, Maximize2, X } from "lucide-react";

type BadgeVariant = "green" | "red" | "amber" | "blue";

type KpiCardData = {
  id: string;
  label: string;
  value: string;
  delta: string;
  deltaDir: "up" | "down" | "neutral";
  monthlyDelta?: string;
  monthlyDeltaDir?: "up" | "down" | "neutral";
  accentColor: string;
  isDummy?: boolean; // Remove this field when data is dynamic
  valueColor?: string;
  sparkPoints?: number[];
  sparkLabels?: string[];
  dailySparkPoints?: number[];
  dailySparkLabels?: string[];
  monthlySparkPoints?: number[];
  monthlySparkLabels?: string[];
  dateRange?: string;
  badges?: { label: string; variant: BadgeVariant }[];
  icon?: string;
};

const badgeStyles: Record<BadgeVariant, { bg: string; text: string }> = {
  green: {
    bg: "bg-green-50 dark:bg-green-950",
    text: "text-green-900 dark:text-green-200",
  },
  red: {
    bg: "bg-red-50 dark:bg-red-950",
    text: "text-red-900 dark:text-red-200",
  },
  amber: {
    bg: "bg-amber-50 dark:bg-amber-950",
    text: "text-amber-900 dark:text-amber-200",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-blue-950",
    text: "text-blue-900 dark:text-blue-200",
  },
};

function getDateRangeLabel(days = 30): string {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function SmallBadge({
  label,
  variant = "green",
}: {
  label: string;
  variant?: BadgeVariant;
}) {
  const styles = badgeStyles[variant];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${styles.bg} ${styles.text}`}
    >
      {label}
    </span>
  );
}

function Sparkline({
  points,
  color,
  labels,
}: {
  points: number[];
  color: string;
  labels?: string[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const max = Math.max(...points);
  const min = Math.min(...points);
  const width = 120;
  const height = 28;
  const px = (i: number) => (i / (points.length - 1)) * width;
  const py = (v: number) => height - ((v - min) / (max - min || 1)) * height;
  const d = points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(v)}`)
    .join(" ");
  const fill = `${d} L ${width} ${height} L 0 ${height} Z`;
  const sliceWidth = width / points.length;

  const handleEnter = (i: number) => {
    setHovered(i);
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({
        x: rect.left + (px(i) / width) * rect.width,
        y: rect.top,
      });
    }
  };

  return (
    <div>
      {hovered !== null &&
        tooltipPos &&
        createPortal(
          <div
            className="fixed -translate-x-1/2 -translate-y-[calc(100%+8px)] pointer-events-none whitespace-nowrap z-[9999] flex flex-col items-center"
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
          >
            <div
              className="text-white text-[10px] font-semibold px-[9px] py-[5px] rounded-lg shadow-[0_2px_8px_rgba(0,0,0,0.2)] text-center min-w-[70px]"
              style={{ background: color }}
            >
              <div className="font-bold text-[11px]">
                {points[hovered].toLocaleString()}
              </div>
              {labels?.[hovered] && (
                <>
                  <div className="h-px bg-white/35 my-1" />
                  <div className="font-normal text-[9px] opacity-[0.88]">
                    {labels[hovered]}
                  </div>
                </>
              )}
            </div>
            <div
              style={{
                width: 0,
                height: 0,
                borderLeft: "4px solid transparent",
                borderRight: "4px solid transparent",
                borderTop: `4px solid ${color}`,
              }}
            />
          </div>,
          document.body,
        )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-13"
        preserveAspectRatio="none"
      >
        <path d={fill} fill={color} fillOpacity={0.08} />
        <path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {hovered !== null && (
          <circle
            cx={px(hovered)}
            cy={py(points[hovered])}
            r={2.5}
            fill={color}
          />
        )}
        {points.map((_, i) => (
          <rect
            key={i}
            x={i * sliceWidth}
            y={0}
            width={sliceWidth}
            height={height}
            fill="transparent"
            onMouseEnter={() => handleEnter(i)}
            onMouseLeave={() => {
              setHovered(null);
              setTooltipPos(null);
            }}
            className="cursor-crosshair"
          />
        ))}
      </svg>
    </div>
  );
}

function DeltaIcon({ dir }: { dir: KpiCardData["deltaDir"] }) {
  if (dir === "up") {
    return (
      <svg width={10} height={10} viewBox="0 0 10 10">
        <path d="M5 2l3 4H2z" fill="#1E7A3C" />
      </svg>
    );
  }

  if (dir === "down") {
    return (
      <svg width={10} height={10} viewBox="0 0 10 10">
        <path d="M5 8l3-4H2z" fill="#A32D2D" />
      </svg>
    );
  }

  return <span className="text-xs">→</span>;
}

function getIcon(icon?: string, color?: string, size: number = 16) {
  if (!icon) return null;
  const style = { color: color ?? "#888", width: size, height: size };
  if (icon === "android") return <Smartphone style={style} />;
  if (icon === "apple") return <Apple style={style} />;
  if (icon === "download") return <Download style={style} />;
  return null;
}
function KpiCard({ kpi }: { kpi: KpiCardData }) {
  const [isMaximized, setIsMaximized] = useState(false);
  const [granularity, setGranularity] = useState<
    "weekly" | "daily" | "monthly"
  >("daily");
  // const deltaColor =
  //   kpi.deltaDir === "up"
  //     ? "#1E7A3C"
  //     : kpi.deltaDir === "down"
  //       ? "#A32D2D"
  //       : "#888";



      

  const activePoints =
    kpi.id === "queries"
      ? granularity === "daily" && kpi.dailySparkPoints?.length
        ? kpi.dailySparkPoints
        : granularity === "monthly" && kpi.monthlySparkPoints?.length
          ? kpi.monthlySparkPoints
          : kpi.sparkPoints
      : kpi.sparkPoints;

  const activeLabels =
    kpi.id === "queries"
      ? granularity === "daily" && kpi.dailySparkLabels?.length
        ? kpi.dailySparkLabels
        : granularity === "monthly" && kpi.monthlySparkLabels?.length
          ? kpi.monthlySparkLabels
          : kpi.sparkLabels
      : kpi.sparkLabels;

      const activeDelta =
  granularity === "monthly"
    ? kpi.monthlyDelta
    : kpi.delta;

const activeDeltaDir =
  granularity === "monthly"
    ? kpi.monthlyDeltaDir
    : kpi.deltaDir;

      const deltaColor =
  activeDeltaDir === "up"
    ? "#1E7A3C"
    : activeDeltaDir === "down"
      ? "#A32D2D"
      : "#888";

  return (
    <>
      <Card className="relative overflow-hidden border border-gray-200 bg-white p-0 dark:border-[#2a2a2a] dark:bg-[#1a1a1a]">
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: kpi.accentColor }}
        />

        {/* Maximize Button */}
        {kpi.sparkPoints && (
          <button
            onClick={() => setIsMaximized(true)}
            className="absolute top-3 right-3 p-1.5 rounded-md bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-sm z-20"
            title="Maximize graph"
          >
            <Maximize2 className="w-4 h-4 text-gray-600 dark:text-gray-300" />
          </button>
        )}

        <CardContent className="p-4 flex flex-col gap-2">
          {/* Upper: label + value + delta with icon on left */}
          <div className="flex items-center gap-3">
            {kpi.icon && (
              <div
                className="flex items-center justify-center w-10 h-10 rounded-full flex-shrink-0"
                style={{ background: `${kpi.accentColor}20` }}
              >
                {getIcon(kpi.icon, kpi.accentColor, 24)}
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {kpi.label}
              </div>
              <div
                className="text-2xl font-semibold dark:text-slate-100"
                style={{ color: kpi.valueColor }}
              >
                {kpi.value}
              </div>
              <div
                className="flex items-center gap-1 text-xs dark:text-gray-300"
                style={{ color: deltaColor }}
              >
                {granularity !== "daily" && <DeltaIcon dir={activeDeltaDir} />} {granularity !== "daily" && activeDelta}
              </div>
            </div>
          </div>

          {/* Lower: sparkline, badges */}
          <div className="flex flex-col gap-1.5">
            {kpi.id === "queries" && kpi.sparkPoints && (
              <div className="flex items-center gap-0.5 self-start rounded-full bg-gray-100 dark:bg-[#2a2a2a] p-0.5 mt-1">
                <button
                  onClick={() => setGranularity("monthly")}
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium transition-all ${
                    granularity === "monthly"
                      ? "bg-white dark:bg-[#3a3a3a] text-gray-800 dark:text-gray-100 shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  Monthly
                </button>

                <button
                  onClick={() => setGranularity("weekly")}
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium transition-all ${
                    granularity === "weekly"
                      ? "bg-white dark:bg-[#3a3a3a] text-gray-800 dark:text-gray-100 shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setGranularity("daily")}
                  className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium transition-all ${
                    granularity === "daily"
                      ? "bg-white dark:bg-[#3a3a3a] text-gray-800 dark:text-gray-100 shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  Daily
                </button>
              </div>
            )}
            {kpi.sparkPoints && (
              <div className="mt-1">
                <Sparkline
                  points={activePoints || []}
                  color={kpi.accentColor}
                  labels={activeLabels}
                />
              </div>
            )}
            {kpi.badges && (
              <div className="flex gap-1 flex-wrap">
                {kpi.badges.map((b) => (
                  <SmallBadge
                    key={b.label}
                    label={b.label}
                    variant={b.variant}
                  />
                ))}
              </div>
            )}
            {kpi.id === "totalInstalls" && (
              <div className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-[#252525] p-2.5 rounded-lg border border-gray-100 dark:border-[#333]">
                Represents users who submitted a farmer profile out of total
                users (overall install count).
              </div>
            )}
          </div>
        </CardContent>

        {/* // Remove this div when data is dynamic */}
        {kpi.isDummy && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] rounded-lg flex items-center justify-center z-10 cursor-not-allowed">
            <span className="text-white text-xs font-semibold tracking-wide"></span>
          </div>
        )}
      </Card>

      {/* Maximized Modal */}
      {isMaximized &&
        kpi.sparkPoints &&
        createPortal(
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
            onClick={() => setIsMaximized(false)}
          >
            <div
              className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-4xl w-full p-6 relative"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close Button */}
              <button
                onClick={() => setIsMaximized(false)}
                className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>

              {/* Header */}
              <div className="mb-6 pr-12">
                <div className="flex items-start justify-between mb-2 gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {kpi.icon && (
                      <div
                        className="flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0"
                        style={{ background: `${kpi.accentColor}20` }}
                      >
                        {getIcon(kpi.icon, kpi.accentColor, 28)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {kpi.label}
                      </div>
                      <div
                        className="text-4xl font-semibold dark:text-slate-100"
                        style={{ color: kpi.valueColor }}
                      >
                        {kpi.value}
                      </div>
                    </div>
                  </div>

                  {/* Toggle for queries card */}
                  {kpi.id === "queries" && kpi.dailySparkPoints && (
                    <div className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-[#2a2a2a] p-1 flex-shrink-0">
                      <button
                        onClick={() => setGranularity("monthly")}
                        className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${
                          granularity === "monthly"
                            ? "bg-white dark:bg-[#3a3a3a] text-gray-800 dark:text-gray-100 shadow-sm"
                            : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                      >
                        Monthly
                      </button>

                      <button
                        onClick={() => setGranularity("weekly")}
                        className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${
                          granularity === "weekly"
                            ? "bg-white dark:bg-[#3a3a3a] text-gray-800 dark:text-gray-100 shadow-sm"
                            : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                      >
                        Weekly
                      </button>
                      <button
                        onClick={() => setGranularity("daily")}
                        className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${
                          granularity === "daily"
                            ? "bg-white dark:bg-[#3a3a3a] text-gray-800 dark:text-gray-100 shadow-sm"
                            : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                        }`}
                      >
                        Daily
                      </button>
                    </div>
                  )}
                </div>
                <div
                  className="flex items-center gap-1.5 text-sm dark:text-gray-300"
                  style={{ color: deltaColor }}
                >
                     {granularity !== "daily" && <DeltaIcon dir={activeDeltaDir} />} {granularity !== "daily" && activeDelta}
                </div>
              </div>

              {/* Chart (left) + Table (right) */}
              <div className="flex gap-4 items-start">
                {/* Sparkline — 65% */}
                <div className="flex-[65] min-w-0">
                  <div className="h-48 relative">
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-700" />
                    <div className="absolute left-0 right-0 bottom-0 h-px bg-gray-300 dark:bg-gray-700" />
                    {/* <Sparkline
                      points={
                        kpi.id === "queries" &&
                        granularity === "daily" &&
                        kpi.dailySparkPoints?.length
                          ? kpi.dailySparkPoints
                          : kpi.sparkPoints
                      }
                      color={kpi.accentColor}
                      labels={
                        kpi.id === "queries" &&
                        granularity === "daily" &&
                        kpi.dailySparkLabels?.length
                          ? kpi.dailySparkLabels
                          : kpi.sparkLabels
                      }
                    /> */}

                    <Sparkline
                      points={activePoints || []}
                      color={kpi.accentColor}
                      labels={activeLabels}
                    />
                  </div>
                  {kpi.badges && (
                    <div className="flex gap-2 flex-wrap mt-4">
                      {kpi.badges.map((b) => (
                        <SmallBadge
                          key={b.label}
                          label={b.label}
                          variant={b.variant}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Table — 35% */}
                <div className="flex-[35] min-w-0 max-h-48 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">
                          Date
                        </th>
                        <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
                          Value
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* {(kpi.id === "queries" &&
                      granularity === "daily" &&
                      kpi.dailySparkPoints?.length
                        ? kpi.dailySparkPoints
                        : kpi.sparkPoints
                      ).map((value, idx) => {
                        const label =
                          (kpi.id === "queries" &&
                          granularity === "daily" &&
                          kpi.dailySparkLabels?.length
                            ? kpi.dailySparkLabels
                            : kpi.sparkLabels)?.[idx] || `Point ${idx + 1}`;
                        return (
                          <tr
                            key={idx}
                            className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {label}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                              {value.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })} */}
                      {(activePoints || []).map((value, idx) => {
                        const label = activeLabels?.[idx] || `Point ${idx + 1}`;

                        return (
                          <tr
                            key={idx}
                            className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                          >
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                              {label}
                            </td>

                            <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                              {value.toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

export function EightCardsComponent({
  kpiRow1,
  kpiRow2,
}: {
  kpiRow1: KpiCardData[];
  kpiRow2: KpiCardData[];
}) {
  const combinedKpis = [...kpiRow1, ...kpiRow2];
  return (
    <>
      {/* Original 2-row layout commented out as requested:
      <div className="mb-2.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {kpiRow1.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {kpiRow2.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
      */}
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {combinedKpis.map((kpi) => (
          <KpiCard key={kpi.id} kpi={kpi} />
        ))}
      </div>
    </>
  );
}
