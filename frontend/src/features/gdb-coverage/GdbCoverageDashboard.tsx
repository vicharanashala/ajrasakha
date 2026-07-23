/**
 * GDB Coverage Intelligence Dashboard
 *
 * Admin-only dashboard that answers:
 *   1. What are our biggest coverage gaps?
 *   2. Which unanswered topics are growing fastest?
 *   3. Where are gaps geographically concentrated?
 *   4. Where should outreach focus?
 */
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  MapPin,
  Database,
  Search,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { fetchGapReport } from "./api";
import type { PriorityGap, CoverageRow, OutreachRecommendation } from "./api";

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const PRIORITY_COLORS: Record<string, string> = {
  CRITICAL: "#ef4444",
  HIGH: "#f97316",
  MEDIUM: "#eab308",
  LOW: "#22c55e",
};

const PRIORITY_BG: Record<string, string> = {
  CRITICAL: "bg-red-500/15 text-red-400 border-red-500/30",
  HIGH: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  MEDIUM: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  LOW: "bg-green-500/15 text-green-400 border-green-500/30",
};

const COVERAGE_BG: Record<string, string> = {
  GAP: "bg-red-500/15 text-red-400 border-red-500/30",
  PARTIAL: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  STRONG: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

const URGENCY_BG: Record<string, string> = {
  URGENT: "bg-red-500/15 text-red-400 border-red-500/30",
  MODERATE: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  ADVISORY: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function Badge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${className}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// KPI card
// ---------------------------------------------------------------------------

function KpiCard({
  icon,
  title,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 flex gap-4 items-start shadow-sm hover:shadow-md transition-shadow">
      <div
        className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${accent ?? "bg-primary/10 text-primary"}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {title}
        </p>
        <p className="text-2xl font-bold text-foreground mt-0.5 leading-none">
          {value}
        </p>
        {sub && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Priority Gaps table
// ---------------------------------------------------------------------------

function PriorityGapsTable({ gaps }: { gaps: PriorityGap[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [cropFilter, setCropFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const crops = useMemo(
    () => [...new Set(gaps.map((g) => g.crop).filter(Boolean))].sort(),
    [gaps]
  );
  const states = useMemo(
    () => [...new Set(gaps.map((g) => g.state).filter(Boolean))].sort(),
    [gaps]
  );

  const filtered = gaps.filter((g) => {
    const q = search.toLowerCase();
    if (q && !g.representative_question.toLowerCase().includes(q)) return false;
    if (cropFilter && g.crop !== cropFilter) return false;
    if (stateFilter && g.state !== stateFilter) return false;
    return true;
  });

  const growthStr = (g: number) => {
    if (g === 0) return "—";
    const pct = Math.round(g * 100);
    return (
      <span className={pct > 0 ? "text-emerald-400" : "text-red-400"}>
        {pct > 0 ? "+" : ""}
        {pct}%
      </span>
    );
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-4 border-b border-border flex flex-col gap-3">
        <h2 className="text-base font-semibold text-foreground">
          Priority Coverage Gaps
        </h2>
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions…"
              className="w-full pl-8 pr-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <select
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none"
          >
            <option value="">All Crops</option>
            {crops.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="px-3 py-2 text-sm bg-muted/40 border border-border rounded-lg focus:outline-none"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground uppercase tracking-wider">
              <th className="px-4 py-3 text-left w-10">#</th>
              <th className="px-4 py-3 text-left">Question / Topic</th>
              <th className="px-4 py-3 text-left">Crop</th>
              <th className="px-4 py-3 text-left">State</th>
              <th className="px-4 py-3 text-left">Domain</th>
              <th className="px-4 py-3 text-right">Demand</th>
              <th className="px-4 py-3 text-right">Weekly Growth</th>
              <th className="px-4 py-3 text-center">Priority</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No gaps match your filters.
                </td>
              </tr>
            )}
            {filtered.map((gap) => (
              <>
                <tr
                  key={gap.cluster_id}
                  className="border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() =>
                    setExpanded(
                      expanded === gap.cluster_id ? null : gap.cluster_id
                    )
                  }
                >
                  <td className="px-4 py-3 font-mono text-muted-foreground">
                    {gap.rank}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-start gap-1">
                      <span className="line-clamp-2 text-foreground font-medium">
                        {gap.representative_question}
                      </span>
                      <span className="flex-shrink-0 mt-0.5 text-muted-foreground">
                        {expanded === gap.cluster_id ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {gap.crop || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {gap.state || "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {gap.domain || "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {gap.current_demand}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {growthStr(gap.growth)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      label={gap.priority_level}
                      className={PRIORITY_BG[gap.priority_level]}
                    />
                  </td>
                </tr>
                {expanded === gap.cluster_id && (
                  <tr key={`${gap.cluster_id}-expanded`} className="bg-muted/20">
                    <td colSpan={8} className="px-8 py-3">
                      <p className="text-xs font-medium text-muted-foreground mb-1.5">
                        Sample questions in this cluster ({gap.size} total):
                      </p>
                      <ul className="space-y-1">
                        {gap.sample_questions.map((sq, i) => (
                          <li
                            key={i}
                            className="text-sm text-foreground/80 before:content-['•'] before:mr-2 before:text-muted-foreground"
                          >
                            {sq}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Demand signals bar chart (top 10 fastest growing)
// ---------------------------------------------------------------------------

function DemandSignalsChart({ gaps }: { gaps: PriorityGap[] }) {
  const data = [...gaps]
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 10)
    .map((g) => ({
      name:
        g.representative_question.length > 30
          ? g.representative_question.slice(0, 30) + "…"
          : g.representative_question,
      growth: Math.round(g.growth * 100),
      current: g.current_demand,
      level: g.priority_level,
    }));

  if (data.length === 0)
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No demand data available.
      </div>
    );

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ left: 8, right: 24, top: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          dataKey="name"
          type="category"
          width={180}
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        />
        <Tooltip
          formatter={(v: number) => [`${v}%`, "Weekly Growth"]}
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: 8,
            fontSize: 12,
          }}
        />
        <Bar dataKey="growth" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={PRIORITY_COLORS[entry.level] ?? "#6366f1"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Coverage Explorer — CSS grid heatmap-style matrix
// ---------------------------------------------------------------------------

function CoverageExplorer({ coverage }: { coverage: CoverageRow[] }) {
  const [cropFilter, setCropFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const crops = useMemo(
    () => [...new Set(coverage.map((r) => r.crop).filter(Boolean))].sort(),
    [coverage]
  );
  const states = useMemo(
    () => [...new Set(coverage.map((r) => r.state).filter(Boolean))].sort(),
    [coverage]
  );

  const filtered = coverage.filter((r) => {
    if (cropFilter && r.crop !== cropFilter) return false;
    if (stateFilter && r.state !== stateFilter) return false;
    return true;
  });

  // Build a lookup: "crop|state|domain" → row
  const lookup = new Map(
    filtered.map((r) => [`${r.crop}|${r.state}|${r.domain}`, r])
  );

  const visibleCrops = cropFilter ? [cropFilter] : crops.slice(0, 8);
  const visibleStates = stateFilter ? [stateFilter] : states.slice(0, 8);

  // Collect all unique domains across filtered rows
  const domains = useMemo(
    () => [...new Set(filtered.map((r) => r.domain).filter(Boolean))].sort().slice(0, 6),
    [filtered]
  );

  if (coverage.length === 0)
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
        No coverage data available.
      </div>
    );

  const cellColor = (level: string) => {
    if (level === "GAP") return "bg-red-500/20 border-red-500/30 hover:bg-red-500/30";
    if (level === "PARTIAL") return "bg-yellow-500/20 border-yellow-500/30 hover:bg-yellow-500/30";
    return "bg-emerald-500/20 border-emerald-500/30 hover:bg-emerald-500/30";
  };

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border flex flex-wrap gap-3 items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">
          Coverage Explorer · Crop × State × Domain
        </h2>
        <div className="flex gap-2">
          <select
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-muted/40 border border-border rounded-lg"
          >
            <option value="">All Crops</option>
            {crops.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="px-3 py-1.5 text-sm bg-muted/40 border border-border rounded-lg"
          >
            <option value="">All States</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 py-3 flex gap-4 text-xs border-b border-border/50">
        {(["GAP", "PARTIAL", "STRONG"] as const).map((lvl) => (
          <span key={lvl} className="flex items-center gap-1.5">
            <span
              className={`w-3 h-3 rounded-sm border ${cellColor(lvl)}`}
            />
            <span className="text-muted-foreground">{lvl}</span>
          </span>
        ))}
        <span className="text-muted-foreground ml-2 italic">
          Showing top {visibleCrops.length} crops × {visibleStates.length}{" "}
          states × {domains.length} domains
        </span>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto p-4">
        {domains.map((domain) => (
          <div key={domain} className="mb-6 last:mb-0">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              {domain}
            </p>
            <div className="grid gap-1" style={{ gridTemplateColumns: `140px repeat(${visibleStates.length}, minmax(70px, 1fr))` }}>
              {/* Header row */}
              <div className="text-xs text-muted-foreground py-1 font-medium">Crop ↓ / State →</div>
              {visibleStates.map((s) => (
                <div key={s} className="text-xs text-muted-foreground text-center py-1 truncate" title={s}>
                  {s.slice(0, 8)}
                </div>
              ))}
              {/* Data rows */}
              {visibleCrops.map((crop) => (
                <>
                  <div key={`label-${crop}`} className="text-xs text-foreground py-1.5 truncate font-medium" title={crop}>
                    {crop}
                  </div>
                  {visibleStates.map((state) => {
                    const row = lookup.get(`${crop}|${state}|${domain}`);
                    if (!row) {
                      return (
                        <div
                          key={`${crop}|${state}`}
                          className="rounded-md border border-dashed border-border/30 bg-muted/10 text-center py-1.5 text-xs text-muted-foreground/30"
                          title="No data"
                        >
                          —
                        </div>
                      );
                    }
                    return (
                      <div
                        key={`${crop}|${state}`}
                        className={`rounded-md border text-center py-1.5 text-xs font-medium cursor-default transition-colors ${cellColor(row.coverage_level)}`}
                        title={`${row.unanswered_demand} unanswered, ${row.gdb_entry_count} GDB entries`}
                      >
                        {row.unanswered_demand}
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Outreach panel
// ---------------------------------------------------------------------------

function OutreachPanel({ recs }: { recs: OutreachRecommendation[] }) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          Outreach Opportunities
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Regions where field engagement should be prioritised
        </p>
      </div>
      <div className="divide-y divide-border/50">
        {recs.length === 0 && (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            No outreach opportunities found.
          </p>
        )}
        {recs.map((r, i) => (
          <div key={i} className="px-6 py-4 hover:bg-muted/20 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap gap-2 mb-1.5">
                  <span className="text-sm font-semibold text-foreground">
                    {r.state}
                  </span>
                  <Badge
                    label={r.urgency}
                    className={URGENCY_BG[r.urgency]}
                  />
                  <Badge
                    label={r.coverage_severity}
                    className={COVERAGE_BG[r.coverage_severity]}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {r.recommendation}
                </p>
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-xl font-bold text-foreground">
                  {r.unanswered_demand}
                </p>
                <p className="text-xs text-muted-foreground">unanswered</p>
              </div>
            </div>
            <div className="flex gap-3 mt-2">
              <span className="text-xs bg-muted/50 rounded px-2 py-0.5 text-muted-foreground">
                🌾 {r.crop}
              </span>
              <span className="text-xs bg-muted/50 rounded px-2 py-0.5 text-muted-foreground">
                🔬 {r.domain}
              </span>
              <span className="text-xs bg-muted/50 rounded px-2 py-0.5 text-muted-foreground">
                GDB: {r.gdb_entry_count} entries
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton loaders
// ---------------------------------------------------------------------------

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
      <div className="flex gap-4 items-start">
        <div className="w-11 h-11 bg-muted/60 rounded-xl" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-muted/60 rounded w-24" />
          <div className="h-7 bg-muted/60 rounded w-16" />
        </div>
      </div>
    </div>
  );
}

function SkeletonSection({ h = 200 }: { h?: number }) {
  return (
    <div
      className="rounded-2xl border border-border bg-card animate-pulse"
      style={{ height: h }}
    />
  );
}

// ---------------------------------------------------------------------------
// Main dashboard component
// ---------------------------------------------------------------------------

export function GdbCoverageDashboard() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["gdb-gap-report", refreshKey],
    queryFn: () => fetchGapReport(refreshKey > 0),
    staleTime: 4 * 60 * 1000, // 4 min — slightly under the 5-min server cache
    retry: 1,
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);
    await refetch();
    setIsRefreshing(false);
  };

  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString()
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-screen-2xl mx-auto px-4 md:px-8 py-8 space-y-8">

        {/* ── A. HEADER ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight flex items-center gap-2">
              <Database className="w-6 h-6 text-primary" />
              GDB Coverage Intelligence
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-lg">
              Identifies unanswered farmer queries, semantic coverage gaps, and
              regional outreach priorities in the Golden Dataset.
            </p>
            {generatedAt && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last generated: {generatedAt}
              </p>
            )}
          </div>
          <button
            id="gdb-refresh-btn"
            onClick={handleRefresh}
            disabled={isLoading || isRefreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors self-start sm:self-auto"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing || isLoading ? "animate-spin" : ""}`}
            />
            {isRefreshing || isLoading ? "Generating…" : "Refresh Report"}
          </button>
        </div>

        {/* Error state */}
        {isError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-5 py-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-400">
                Failed to load report
              </p>
              <p className="text-xs text-red-400/70 mt-0.5">
                {(error as Error)?.message ?? "Unknown error"}. Make sure the
                acc_api service is running.
              </p>
            </div>
          </div>
        )}

        {/* ── B. KPI CARDS ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          ) : (
            <>
              <KpiCard
                icon={<Search className="w-5 h-5" />}
                title="Unanswered Queries"
                value={data?.kpis.total_unanswered_queries ?? 0}
                sub="All disclaimer-triggered questions"
                accent="bg-indigo-500/10 text-indigo-400"
              />
              <KpiCard
                icon={<AlertTriangle className="w-5 h-5" />}
                title="Priority Gaps"
                value={data?.kpis.priority_gaps ?? 0}
                sub="CRITICAL + HIGH clusters"
                accent="bg-red-500/10 text-red-400"
              />
              <KpiCard
                icon={<TrendingUp className="w-5 h-5" />}
                title="Fastest Growing Topic"
                value={
                  data?.kpis.fastest_growing_topic
                    ? data.kpis.fastest_growing_topic.slice(0, 28) + "…"
                    : "—"
                }
                sub={data?.kpis.fastest_growing_topic ?? ""}
                accent="bg-emerald-500/10 text-emerald-400"
              />
              <KpiCard
                icon={<MapPin className="w-5 h-5" />}
                title="Regions With Gaps"
                value={data?.kpis.regions_with_gaps ?? 0}
                sub="States with no GDB coverage"
                accent="bg-orange-500/10 text-orange-400"
              />
            </>
          )}
        </div>

        {/* ── C. PRIORITY QUESTIONS TABLE ── */}
        {isLoading ? (
          <SkeletonSection h={400} />
        ) : (
          <PriorityGapsTable gaps={data?.top_gaps ?? []} />
        )}

        {/* ── D + E. COVERAGE EXPLORER + DEMAND SIGNALS ── */}
        <div className="grid xl:grid-cols-2 gap-6">
          {/* Coverage Explorer */}
          {isLoading ? (
            <SkeletonSection h={380} />
          ) : (
            <CoverageExplorer coverage={data?.coverage ?? []} />
          )}

          {/* Demand Signals chart */}
          {isLoading ? (
            <SkeletonSection h={380} />
          ) : (
            <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="px-6 pt-5 pb-4 border-b border-border">
                <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  Demand Signals · Weekly Growth
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Top 10 fastest-growing unanswered topics (current vs previous
                  7 days)
                </p>
              </div>
              <div className="p-4">
                <DemandSignalsChart gaps={data?.top_gaps ?? []} />
              </div>
            </div>
          )}
        </div>

        {/* ── F. OUTREACH OPPORTUNITIES ── */}
        {isLoading ? (
          <SkeletonSection h={320} />
        ) : (
          <OutreachPanel recs={data?.outreach_recommendations ?? []} />
        )}
      </div>
    </div>
  );
}
