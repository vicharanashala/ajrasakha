// ─── Knowledge & Awareness Card Component ────────────────────────────────────
import React from "react";
import { RefreshCw, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

export interface KccAndAgriAppUsageData {
  kccAwareness?: Array<{ count: number }>;
  agriAppUsage?: Array<{ count: number }>;
}

export interface KnowledgeAwarenessCardProps {
  userMetricesData?: KccAndAgriAppUsageData;
  hovered: string | null;
  setHovered: (value: string | null) => void;
  agriHovered: string | null;
  setAgriHovered: (value: string | null) => void;
  isRefreshing: boolean;
  onRefresh: () => void;
  className?: string;
  onMetricClick?: (metric: "kcc" | "agri", value: "yes" | "no") => void;
}

interface AwarenessMetricProps {
  label: string;
  data?: Array<{ count: number }>;
  hovered: string | null;
  setHover: (value: string | null) => void;
  color: string;
  gradId: string;
  onMetricClick?: (value: "yes" | "no") => void;
}

function AwarenessMetric({
  label,
  data,
  hovered: h,
  setHover,
  color,
  gradId,
  onMetricClick,
}: AwarenessMetricProps) {
  const yes = data?.[0]?.count || 0;
  const no = data?.[1]?.count || 0;
  const total = yes + no;
  const r = 45,
    cx = 60,
    cy = 60;
  const circ = 2 * Math.PI * r;
  const yesDash = total ? (yes / total) * circ : 0;
  const noDash = total ? (no / total) * circ : 0;
  const yesPct = total ? Math.round((yes / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-3 min-w-0 group/chart">
      <div className="relative">
        <svg
          viewBox="0 0 120 120"
          className="relative w-[120px] h-[120px]"
        >
          <defs>
            <linearGradient
              id={gradId}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="100%"
            >
              <stop offset="0%" stopColor={color} stopOpacity="1" />
              <stop offset="100%" stopColor={color} stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Track */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            className="stroke-muted"
            strokeWidth={10}
          />

          {/* Yes arc */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={h === "yes" ? 13 : 10}
            strokeLinecap="round"
            strokeDasharray={`${yesDash} ${circ}`}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="cursor-pointer transition-[stroke-width] duration-200"
            onMouseEnter={() => setHover("yes")}
            onMouseLeave={() => setHover(null)}
            onClick={() => onMetricClick?.("yes")}
          />

          {/* No arc */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            className="stroke-muted-foreground/40 cursor-pointer transition-[stroke-width] duration-200"
            strokeWidth={h === "no" ? 13 : 10}
            strokeLinecap="round"
            strokeDasharray={`${noDash} ${circ}`}
            strokeDashoffset={-yesDash}
            transform={`rotate(-90 ${cx} ${cy})`}
            onMouseEnter={() => setHover("no")}
            onMouseLeave={() => setHover(null)}
            onClick={() => onMetricClick?.("no")}
          />

          {/* Center text */}
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            className="fill-foreground font-bold tabular-nums"
            fontSize={h ? 16 : 20}
          >
            {h === "yes" ? yes : h === "no" ? no : total}
          </text>
          <text
            x={cx}
            y={cy + 12}
            textAnchor="middle"
            className="fill-muted-foreground"
            fontSize={8}
            style={{
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {h === "yes" ? "Yes" : h === "no" ? "No" : "Total"}
          </text>
        </svg>
      </div>

      <div className="flex flex-col items-center gap-1">
        <span className="text-xs font-medium text-foreground">{label}</span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground tabular-nums cursor-pointer hover:bg-muted/80 transition-colors"
          onClick={() => onMetricClick?.("yes")}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          {yesPct}% Yes
        </span>
      </div>
    </div>
  );
}

export function KnowledgeAwarenessCard({
  userMetricesData,
  hovered,
  setHovered,
  agriHovered,
  setAgriHovered,
  isRefreshing,
  onRefresh,
  className,
  onMetricClick,
}: KnowledgeAwarenessCardProps) {
  return (
    <div
      className={cn(
        "h-full rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/50 backdrop-blur-sm p-5 shadow-sm hover:shadow-md transition-shadow duration-300",
        className
      )}
    >
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

      <div className="flex items-center gap-2 mb-5">
        <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
          <span>Knowledge & Awareness</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help inline-flex items-center text-muted-foreground/60 hover:text-muted-foreground">
                <InfoIcon className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="normal-case tracking-normal">
              Shows survey statistics on KCC awareness and agricultural app
              usage.
            </TooltipContent>
          </Tooltip>
        </h3>
        <button
          onClick={onRefresh}
          className="rounded-lg shadow-sm backdrop-blur-sm transition-all duration-200"
          title="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
        </button>
      </div>

      <div className="flex flex-wrap gap-6 justify-center items-center h-[calc(100%-3rem)] overflow-hidden">
        <AwarenessMetric
          label="KCC Awareness"
          data={userMetricesData?.kccAwareness}
          hovered={hovered}
          setHover={setHovered}
          color="hsl(142 71% 45%)"
          gradId="kccGrad"
          onMetricClick={(val) => onMetricClick?.("kcc", val)}
        />
        <AwarenessMetric
          label="Uses Agri Apps"
          data={userMetricesData?.agriAppUsage}
          hovered={agriHovered}
          setHover={setAgriHovered}
          color="hsl(217 91% 60%)"
          gradId="agriGrad"
          onMetricClick={(val) => onMetricClick?.("agri", val)}
        />
      </div>
    </div>
  );
}

export default KnowledgeAwarenessCard;