import { useState, useRef, useMemo } from "react";
import CountUp from "react-countup";
import { createPortal } from "react-dom";
import { Card, CardContent } from "@/components/atoms/card";
import {
  Download,
  Smartphone,
  Apple,
  Maximize2,
  X,
  Info as InfoIcon,
  RefreshCw,
} from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/atoms/tooltip";
import { TotalQueriesModal } from "./components/TotalQueriesModal";
import { ActiveFarmersTable } from "./components/ActiveFarmersTable";
import type { QueryGranularity } from "./components/TotalQueriesModal";
import type { AnalyticsEntry } from "./utils/dashboardHelpers";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { QueryCategoryQuestionsModal } from "./components/QueryCategoryQuestionsModal";

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
  dailyAnalytics?: AnalyticsEntry[];
  weeklyAnalytics?: AnalyticsEntry[];
  monthlyAnalytics?: AnalyticsEntry[];
  source?: "vicharanashala" | "annam" | "whatsapp";
  userType?: "all" | "external" | "internal";
  querySummaries?: {
    daily: { label: string; totalQueries: number };
    weekly: { label: string; totalQueries: number };
    monthly: { label: string; totalQueries: number };
  };
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

export function getDateRangeLabel(days = 30): string {
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

  if (!points || points.length === 0) {
    return null;
  }

  const max = Math.max(...points);
  const min = Math.min(...points);
  const width = 120;
  const height = 28;

  const px = (i: number) => {
    if (points.length <= 1) return width / 2;
    return (i / (points.length - 1)) * width;
  };

  const py = (v: number) => height - ((v - min) / (max - min || 1)) * height;

  const d =
    points.length === 1
      ? `M 0 ${py(points[0])} L ${width} ${py(points[0])}`
      : points
          .map((v, i) => `${i === 0 ? "M" : "L"} ${px(i)} ${py(v)}`)
          .join(" ");

  const fill =
    points.length === 1
      ? `M 0 ${py(points[0])} L ${width} ${py(points[0])} L ${width} ${height} L 0 ${height} Z`
      : `${d} L ${width} ${height} L 0 ${height} Z`;

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

export function DeltaIcon({ dir }: { dir: KpiCardData["deltaDir"] }) {
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

/** Animates a KPI value with CountUp, handling slash-separated (e.g. "12 / 100") and plain numeric formats. */
function AnimatedKpiValue({ value, kpiId }: { value: string; kpiId: string }) {
  const raw = String(value ?? "");

  // Handled slash-separated "X / Y" formats (used in DAU and Total Installs)
  if (raw.includes("/")) {
    const [leftRaw, rightRaw] = raw
      .split("/")
      .map((s) => s.replace(/,/g, "").trim());
    const left = Number(leftRaw);
    const right = Number(rightRaw);
    return (
      <>
        {Number.isFinite(left) ? (
          <CountUp end={left} duration={1.5} preserveValue separator="," />
        ) : (
          leftRaw
        )}
        {" / "}
        {Number.isFinite(right) ? (
          <CountUp end={right} duration={1.5} preserveValue separator="," />
        ) : (
          rightRaw
        )}
      </>
    );
  }

  // Session card or values with " min" suffix
  if (raw.endsWith(" min")) {
    const num = Number(raw.replace(" min", "").replace(/,/g, ""));
    if (Number.isFinite(num)) {
      return (
        <CountUp
          end={num}
          duration={1.5}
          decimals={1}
          suffix=" min"
          preserveValue
        />
      );
    }
  }

  // Plain numeric (may contain commas)
  const num = Number(raw.replace(/,/g, ""));
  if (Number.isFinite(num)) {
    return <CountUp end={num} duration={1.5} preserveValue separator="," />;
  }

  // Fallback: non-numeric
  return <>{raw}</>;
}

function KpiCard({
  kpi,
  source = "annam",
  userType,
  isLoading,
  onCardClick,
}: {
  kpi: KpiCardData;
  source?: "vicharanashala" | "annam" | "whatsapp";
  userType?: string;
  isLoading?: boolean;
  onCardClick?: (id: string) => void;
}) {
  const queryClient = useQueryClient();
  const handleKPIrefresh = async () => {
    await queryClient.refetchQueries({ queryKey: ["dashboard-data"] });
  };

  const [isMaximized, setIsMaximized] = useState(false);
  const [granularity, setGranularity] = useState<QueryGranularity>("daily");
  const [showQuestions, setShowQuestions] = useState(false);

  const shouldBlur = source === "whatsapp" && kpi.id === "dau";
  const shouldHide = source === "whatsapp" && kpi.id === "session";

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

  // Dynamic label and value based on granularity tab (queries card only)
  const activeCardLabel =
    kpi.id === "queries" && kpi.querySummaries
      ? (kpi.querySummaries[granularity]?.label ?? kpi.label)
      : kpi.label;

  const activeCardValue =
    kpi.id === "queries" && kpi.querySummaries
      ? (kpi.querySummaries[granularity]?.totalQueries?.toLocaleString() ??
        kpi.value)
      : kpi.value;

  const dailyActiveFarmerPct = (() => {
    if (kpi.id !== "dau") return null;
    const raw = String(activeCardValue ?? "");
    const [activeStr, totalStr] = raw
      .split("/")
      .map((v) => v?.replace(/,/g, "").trim());
    const active = Number(activeStr);
    const total = Number(totalStr);
    if (!Number.isFinite(active) || !Number.isFinite(total) || total <= 0)
      return null;
    return ((active / total) * 100).toFixed(2);
  })();

  const kpiTooltipText = (() => {
    switch (kpi.id) {
      case "totalInstalls":
        return "Total number of app installations and profiles submitted by users.";
      case "dau":
        return "Daily Active Users: Represents farmers who were active today out of total registered users.";
      case "queries":
        return "Total questions asked by users (unique + duplicate queries).";
      case "session":
        return "Average duration of user interaction sessions with the chatbot.";
      default:
        return null;
    }
  })();

  return (
    <>
      <Card
        onClick={() => onCardClick?.(kpi.id)}
        className={`group relative overflow-hidden rounded-2xl border border-gray-200/80 bg-white p-0 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg dark:border-[#2a2a2a] dark:bg-gradient-to-br dark:from-[#1a1a1a] dark:to-[#161616] ${
          shouldHide
            ? "pointer-events-none hidden select-none"
            : shouldBlur
              ? "pointer-events-none select-none opacity-90 blur-sm"
              : ""
        } ${onCardClick && kpi.id === "totalInstalls" ? "cursor-pointer" : ""}`}
      >
        {/* Accent bar */}
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: kpi.accentColor }}
        />

        {/* Soft accent glow */}
        <div
          className="pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full opacity-20 blur-3xl transition-opacity duration-300 group-hover:opacity-30"
          style={{ background: kpi.accentColor }}
        />

        {/* Maximize button */}
        {kpi.sparkPoints && (
          <button
            onClick={() => setIsMaximized(true)}
            className="absolute right-3 top-3 z-20 rounded-lg border border-gray-200/60 bg-white/70 p-1.5 opacity-0 shadow-sm backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md group-hover:opacity-100 dark:border-[#333] dark:bg-gray-800/70 dark:hover:bg-gray-700"
            title="Maximize graph"
            aria-label="Maximize graph"
          >
            <Maximize2 className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
          </button>
        )}
        {kpi.id === "totalInstalls" && (
          <button
            onClick={handleKPIrefresh}
            className="absolute top-4 right-4 z-20 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
            title="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5${isLoading ? "animate-spin" : ""}`}
            />
          </button>
        )}
        <CardContent className="relative flex flex-col gap-3 p-5">
          {/* Header: icon + label + value */}
          <div className="flex items-start gap-3">
            {kpi.icon && (
              <div
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ring-1 ring-inset transition-transform duration-300 group-hover:scale-105"
                style={{
                  background: `${kpi.accentColor}1A`,
                  // @ts-expect-error css var
                  "--tw-ring-color": `${kpi.accentColor}33`,
                }}
              >
                {getIcon(kpi.icon, kpi.accentColor, 22)}
              </div>
            )}
            {/* <div className="flex items-start justify-between"> */}
            <div className="flex min-w-0 flex-col gap-1">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <span>{activeCardLabel}</span>
                {kpiTooltipText && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground normal-case tracking-normal">
                        <InfoIcon className="h-3 w-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="normal-case tracking-normal text-xs font-normal">
                      {kpiTooltipText}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
              <div
                className="text-2xl font-bold leading-tight tracking-tight tabular-nums dark:text-slate-100 cursor-pointer"
                style={{ color: kpi.valueColor }}
                onClick={() => {
                  if (kpi.id === "queries") {
                    setShowQuestions(true);
                  }
                }}
              >
                <AnimatedKpiValue value={activeCardValue} kpiId={kpi.id} />
              </div>
              {kpi.id === "dau" && dailyActiveFarmerPct !== null && (
                <div className="text-[11px] text-muted-foreground">
                  {dailyActiveFarmerPct}% farmers asked at least one question
                  today
                </div>
              )}
            </div>

            {/* </div> */}
          </div>

          {/* Body: granularity toggle + sparkline + badges + note */}
          <div className="flex flex-col gap-2">
            {kpi.id === "queries" && kpi.sparkPoints && (
              <div className="inline-flex items-center gap-0.5 self-start rounded-full border border-gray-200/60 bg-gray-100/80 p-0.5 dark:border-[#333] dark:bg-[#222]">
                {(["monthly", "weekly", "daily"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => setGranularity(g)}
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium capitalize transition-all duration-200 ${
                      granularity === g
                        ? "bg-white text-gray-800 shadow-sm dark:bg-[#3a3a3a] dark:text-gray-100"
                        : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            {kpi.sparkPoints && (
              <div className="-mx-1 mt-1">
                <Sparkline
                  points={activePoints || []}
                  color={kpi.accentColor}
                  labels={activeLabels}
                />
              </div>
            )}

            {kpi.badges && (
              <div className="flex flex-wrap gap-1">
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
              <div className="mt-1 rounded-lg border border-gray-100 bg-gray-50/70 p-2.5 text-[11px] leading-relaxed text-gray-500 dark:border-[#333] dark:bg-[#222] dark:text-gray-400">
                Represents users who submitted a farmer profile out of total
                users (overall install count).
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {isMaximized && kpi.id === "queries" && kpi.sparkPoints && (
        <TotalQueriesModal
          granularity={granularity}
          onGranularityChange={setGranularity}
          onClose={() => setIsMaximized(false)}
          accentColor={kpi.accentColor}
          valueColor={kpi.valueColor}
          icon={getIcon(kpi.icon, kpi.accentColor, 28)}
          label={kpi.label}
          value={kpi.value}
          analytics={{
            daily: kpi.dailyAnalytics,
            weekly: kpi.weeklyAnalytics,
            monthly: kpi.monthlyAnalytics,
          }}
          source={kpi.source}
          userType={kpi.userType}
          summaries={kpi.querySummaries}
          renderChart={() => (
            <Sparkline
              points={activePoints || []}
              color={kpi.accentColor}
              labels={activeLabels}
            />
          )}
        />
      )}

      {/* Maximized Modal */}
      {isMaximized &&
        kpi.id !== "queries" &&
        kpi.sparkPoints &&
        createPortal(
          <AnimatePresence>
            {isMaximized && (
              <motion.div
                className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setIsMaximized(false)}
              >
                <motion.div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="kpi-modal-title"
                  className="relative w-full max-w-5xl rounded-2xl bg-white dark:bg-[#111] shadow-[0_20px_70px_-15px_rgba(0,0,0,0.4)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
                  initial={{ opacity: 0, scale: 0.96, y: 16 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 8 }}
                  transition={{ type: "spring", stiffness: 320, damping: 28 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Accent bar */}
                  <div
                    className="h-1 w-full"
                    style={{
                      background: `linear-gradient(90deg, ${kpi.accentColor}, transparent)`,
                    }}
                  />

                  <div className="p-6 sm:p-8">
                    {/* Close */}
                    <button
                      onClick={() => setIsMaximized(false)}
                      className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                      aria-label="Close"
                    >
                      <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                    </button>

                    {/* Header */}
                    <motion.div
                      className="mb-6 pr-12 flex items-center gap-4"
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.08 }}
                    >
                      {kpi.icon && (
                        <div
                          className="flex items-center justify-center w-14 h-14 rounded-2xl flex-shrink-0 ring-1 ring-black/5 dark:ring-white/10"
                          style={{ background: `${kpi.accentColor}1A` }}
                        >
                          {getIcon(kpi.icon, kpi.accentColor, 30)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                          {activeCardLabel}
                        </div>
                        <div
                          className="text-4xl sm:text-5xl font-semibold tracking-tight dark:text-slate-100"
                          style={{ color: kpi.valueColor }}
                        >
                          <AnimatedKpiValue
                            value={activeCardValue}
                            kpiId={kpi.id}
                          />
                        </div>
                      </div>
                    </motion.div>

                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col lg:flex-row gap-6 items-stretch">
                        {/* Sparkline */}
                        <motion.div
                          className="flex-[65] min-w-0"
                          initial={{ opacity: 0, x: -12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 }}
                        >
                          <div className="h-56 relative rounded-xl bg-gray-50/60 dark:bg-white/5 p-4">
                            <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200 dark:bg-white/10" />
                            <div className="absolute left-4 right-4 bottom-4 h-px bg-gray-200 dark:bg-white/10" />
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
                        </motion.div>

                        {/* Table */}
                        <motion.div
                          className="flex-[35] min-w-0"
                          initial={{ opacity: 0, x: 12 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                        >
                          <div className="max-h-56 overflow-y-auto border border-gray-200 dark:border-white/10 rounded-xl">
                            <table className="w-full text-sm">
                              <thead className="bg-gray-50 dark:bg-white/5 sticky top-0 z-10 backdrop-blur">
                                <tr>
                                  <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300">
                                    Date
                                  </th>
                                  <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300">
                                    Total Queries
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {(activePoints || []).map((value, idx) => (
                                  <motion.tr
                                    key={idx}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.25 + idx * 0.015 }}
                                    className="border-t border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5"
                                  >
                                    <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                      {activeLabels?.[idx] ||
                                        `Point ${idx + 1}`}
                                    </td>
                                    <td className="px-3 py-2 text-right font-medium tabular-nums text-gray-900 dark:text-gray-100">
                                      {value.toLocaleString()}
                                    </td>
                                  </motion.tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </motion.div>
                      </div>

                      {kpi.id === "dau" && (
                        <motion.div
                          className="w-full"
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.3 }}
                        >
                          <ActiveFarmersTable
                            source={source}
                            userType={kpi.userType || "all"}
                          />
                        </motion.div>
                      )}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
      {showQuestions && (
        <QueryCategoryQuestionsModal
          period={granularity}
          source={source}
          userType={userType}
          onClose={() => setShowQuestions(false)}
        />
      )}
    </>
  );
}

export function EightCardsComponent({
  kpiRow1,
  kpiRow2,
  source = "annam",
  userType,
  isLoading,
  onCardClick,
}: {
  kpiRow1: KpiCardData[];
  kpiRow2: KpiCardData[];
  source?: "vicharanashala" | "annam" | "whatsapp";
  userType?: string;
  isLoading: boolean;
  onCardClick?: (id: string) => void;
}) {
  const combinedKpis = [...kpiRow1, ...kpiRow2];
  const customOrder = [
    "totalInstalls",
    "dau",
    "queries",
    "session",
    "bugs",
    "repeatQuery",
    "states",
  ];

  combinedKpis.sort((a, b) => {
    const idxA = customOrder.indexOf(a.id);
    const idxB = customOrder.indexOf(b.id);
    return idxA - idxB;
  });
  if (isLoading) {
    return (
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border border-border/50 bg-card p-5 animate-pulse min-h-[190px]"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="space-y-2 flex-1">
                <div className="h-3 w-24 rounded bg-muted" />
                <div className="h-8 w-20 rounded bg-muted" />
              </div>

              <div className="h-10 w-10 rounded-xl bg-muted" />
            </div>

            <div className="space-y-2">
              <div className="h-2 w-full rounded bg-muted" />
              <div className="h-2 w-3/4 rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  // console.log("Combinedkpis", combinedKpis);
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
          <KpiCard key={kpi.id} kpi={kpi} source={source} userType={userType} onCardClick={onCardClick} />
        ))}
      </div>
    </>
  );
}
