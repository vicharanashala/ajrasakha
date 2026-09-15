import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// Score Trend chart helpers (Trust/Farmer Experience/Avg Response/Review
// TAT) - visualization-only, never recomputes the underlying scores. The
// constants below are algorithm parameters, not data-derived hardcodes.
const X_AXIS_TARGET_TICK_COUNT = 10;
const OUTLIER_PERCENTILE = 95;
const OUTLIER_AXIS_HEADROOM = 1.15;

function formatShortDate(iso: string, includeYear = false): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(
    "en-US",
    includeYear
      ? { month: "short", day: "numeric", year: "2-digit", timeZone: "UTC" }
      : { month: "short", day: "numeric", timeZone: "UTC" },
  );
}

// Multi-year tick sets need the year suffix on every label, or two
// same-month-day labels from different years read as if the axis went
// backwards.
function xAxisTicksSpanMultipleYears(ticks: string[]): boolean {
  return new Set(ticks.map((d) => d.slice(0, 4))).size > 1;
}

function formatFullDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// Picks a subset of the given (already chronologically sorted) ISO dates as
// X-axis tick labels, spaced by array index rather than calendar distance:
// Recharts renders a string dataKey as a category axis, placing every point
// at equal pixel width by index regardless of real date gaps. Calendar-based
// spacing would over-label a sliver of pixel width containing far-apart
// outlier dates while under-labeling the dense main range. Always keeps the
// first and last date so the axis never looks truncated.
export function buildXAxisTicks(dates: string[]): string[] {
  if (dates.length <= X_AXIS_TARGET_TICK_COUNT) return dates;
  const step = Math.max(1, Math.ceil(dates.length / X_AXIS_TARGET_TICK_COUNT));
  const ticks: string[] = [];
  for (let i = 0; i < dates.length; i += step) {
    ticks.push(dates[i]);
  }
  const lastDate = dates[dates.length - 1];
  if (ticks[ticks.length - 1] !== lastDate) ticks.push(lastDate);
  return ticks;
}

function computePercentile(values: number[], percentile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1));
  return sorted[idx];
}

export interface OutlierInfo {
  date: string;
  value: number;
}

// Clamps each day's plotted value to the OUTLIER_PERCENTILE of real
// (non-null) values, so one extreme day can't flatten the whole axis;
// clamped points are flagged via outlierKeyOut, but the original raw value
// (rawKey) survives untouched for the tooltip - only the drawn position is
// capped. noDataPlotValue controls what a no-data day plots as: null (the
// default) renders a true gap; Avg Response/Review TAT pass 0 instead,
// prioritizing visual line continuity over the 0-vs-no-data distinction for
// just those 2 tabs, while still excluding those days from the percentile
// math via rawKey being null for them.
export function buildRobustRangeSeries<T extends { date: string }>(
  points: T[],
  rawKey: string,
  plotKeyOut: string,
  outlierKeyOut: string,
  noDataPlotValue: number | null = null,
): { data: (T & Record<string, unknown>)[]; domainMax: number; outliers: OutlierInfo[] } {
  const realValues = points
    .map((p) => (p as Record<string, unknown>)[rawKey] as number | null | undefined)
    .filter((v): v is number => v !== null && v !== undefined);
  const percentileValue = computePercentile(realValues, OUTLIER_PERCENTILE);
  const rawMax = realValues.length ? Math.max(...realValues) : 0;
  // Falls back to the raw max if the percentile itself is 0, so the axis is
  // never zero-height.
  const domainMax = Math.max(1, percentileValue > 0 ? Math.ceil(percentileValue * OUTLIER_AXIS_HEADROOM) : rawMax);

  const outliers: OutlierInfo[] = [];
  const data = points.map((p) => {
    const v = (p as Record<string, unknown>)[rawKey] as number | null | undefined;
    let isOutlier = false;
    let plotValue: number | null = noDataPlotValue;
    if (v !== null && v !== undefined) {
      isOutlier = v > domainMax;
      if (isOutlier) outliers.push({ date: p.date, value: v });
      plotValue = isOutlier ? domainMax : v;
    }
    return { ...p, [plotKeyOut]: plotValue, [outlierKeyOut]: isOutlier };
  });
  return { data, domainMax, outliers };
}

// Outlier points render as a triangle at the clamped top-of-axis position;
// the marker's position never implies the real value, only the tooltip does.
function makeTrendDot(outlierKey: string | undefined, color: string) {
  return function TrendDot(props: {
    cx?: number;
    cy?: number;
    payload?: Record<string, unknown>;
    index?: number;
  }) {
    const { cx, cy, payload, index } = props;
    // index is the fallback key since payload/cx/cy can be missing for gap
    // points.
    const dateKey = String(payload?.date ?? `dot-${index}`);
    // Recharts' dot renderer requires a ReactElement, never null.
    if (cx == null || cy == null) return <g key={`empty-${dateKey}`} />;
    const isOutlier = outlierKey ? Boolean(payload?.[outlierKey]) : false;
    if (isOutlier) {
      return (
        <polygon
          key={`outlier-${dateKey}`}
          points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`}
          fill="#ef4444"
          stroke="#ef4444"
        />
      );
    }
    return <circle key={`dot-${dateKey}`} cx={cx} cy={cy} r={2} fill={color} stroke={color} />;
  };
}

export interface TrendTooltipConfig {
  valueLabel: string;
  valueSuffix: string;
  rawValueKey: string;
  hasDataKey?: string;
  sampleCountKey?: string;
}

// Shared tooltip for all 4 tabs, reading the full underlying row
// (payload[0].payload) so a "no data" day can say so explicitly instead of
// showing whatever a null line segment would otherwise render as.
function TrendTooltip({
  active,
  payload,
  config,
}: {
  active?: boolean;
  payload?: { payload: Record<string, unknown> }[];
  config: TrendTooltipConfig;
}) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;

  // Trust/Farmer (hasDataKey) show a "No valid data" fallback. Avg
  // Response/Review TAT (sampleCountKey, no hasDataKey) always show the
  // value + reading count, even at 0 readings - since those 2 tabs plot 0
  // rather than a gap, the reading count is what lets a hovering user tell
  // a real 0 apart from no data.
  const hasData = config.hasDataKey ? Boolean(point[config.hasDataKey]) : true;

  const sampleCount = config.sampleCountKey ? Number(point[config.sampleCountKey] ?? 0) : null;

  return (
    <div className="rounded-md border bg-popover text-popover-foreground shadow-md p-2 text-xs space-y-0.5 min-w-[150px]">
      <div className="font-semibold">{formatFullDate(String(point.date))}</div>
      {hasData ? (
        <>
          <div>
            {config.valueLabel}: <span className="font-medium">{String(point[config.rawValueKey])}{config.valueSuffix}</span>
          </div>
          {sampleCount !== null && (
            <div className="text-muted-foreground">
              {sampleCount} valid reading{sampleCount === 1 ? "" : "s"}
            </div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground">No valid data</div>
      )}
    </div>
  );
}

export interface TrendChartProps {
  data: Record<string, unknown>[];
  xTicks: string[];
  plotKey: string;
  color: string;
  name: string;
  yLabel: string;
  yDomain: [number, number];
  yTicks?: number[];
  tooltipConfig: TrendTooltipConfig;
  outlierKey?: string;
  outliers?: OutlierInfo[];
}

export function TrendChart({
  data,
  xTicks,
  plotKey,
  color,
  name,
  yLabel,
  yDomain,
  yTicks,
  tooltipConfig,
  outlierKey,
  outliers,
}: TrendChartProps) {
  const worstOutlier =
    outliers && outliers.length ? outliers.reduce((worst, o) => (o.value > worst.value ? o : worst), outliers[0]) : null;
  const tickIncludesYear = xAxisTicksSpanMultipleYears(xTicks);

  return (
    <div className="relative h-full w-full">
      {worstOutlier && (
        <div className="absolute top-0 right-0 z-10 text-[10px] px-2 py-1 rounded-bl-md bg-red-50 text-red-600 border-l border-b border-red-200">
          {outliers!.length} value{outliers!.length === 1 ? "" : "s"} above range (max {worstOutlier.value}
          {tooltipConfig.valueSuffix} on {formatShortDate(worstOutlier.date, true)})
        </div>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 25, right: 30, bottom: 15, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            ticks={xTicks}
            interval={0}
            tickFormatter={(iso: string) => formatShortDate(iso, tickIncludesYear)}
            tick={{ fontSize: 9 }}
            angle={-35}
            textAnchor="end"
            height={70}
            label={{ value: "Test Date", position: "insideBottom", offset: -15, fontSize: 11, fill: "#374151" }}
          />
          <YAxis
            domain={yDomain}
            ticks={yTicks}
            tick={{ fontSize: 9 }}
            label={{ value: yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: "#374151" }}
          />
          <Tooltip content={<TrendTooltip config={tooltipConfig} />} />
          <Legend verticalAlign="top" height={20} wrapperStyle={{ fontSize: 10 }} />
          <Line type="linear" dataKey={plotKey} name={name} stroke={color} strokeWidth={1.5} dot={makeTrendDot(outlierKey, color)} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
