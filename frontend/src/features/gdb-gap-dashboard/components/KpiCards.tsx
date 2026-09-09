import { AlertTriangle, HelpCircle, MapPin, Sprout } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import type { GapClusterItem, GapReport } from "../types";

/**
 * Derives the four top-level KPIs directly from the backend response.
 *
 * Because the backend ships a *raw* gap-report (not a pre-computed KPI
 * block), every metric is computed on the client from `clusters`,
 * `total_queries_analyzed`, and `gaps_by_priority`.  The values are
 * intentionally defensive — each one falls back to `—` (em dash) when
 * the input data is missing so the UI never shows a stale number.
 */
export function deriveKpis(report?: GapReport) {
  const clusters: GapClusterItem[] = report?.clusters ?? [];

  // Unanswered demand = total farmer queries that fell through to a gap
  // inside the current demand window. The backend already pre-aggregates
  // this in `total_queries_analyzed`; we also derive from clusters as a
  // fallback when the aggregate is absent.
  const unansweredDemand =
    report?.total_queries_analyzed ??
    clusters.reduce((sum, c) => sum + (c.query_count ?? 0), 0);

  // Priority gaps = sum of clusters in the "critical" / "high" buckets
  // (falls back to total clusters when the bucket map is missing).
  const priorityBuckets = report?.gaps_by_priority;
  let priorityGaps: number | undefined;
  if (priorityBuckets && typeof priorityBuckets === "object") {
    const critical = priorityBuckets.critical?.length ?? 0;
    const high = priorityBuckets.high?.length ?? 0;
    priorityGaps = critical + high;
  }
  if (priorityGaps === undefined || priorityGaps === 0) {
    priorityGaps = report?.total_clusters_found ?? clusters.length;
  }

  // Fastest-growing topic = the cluster with the highest growth ratio.
  // When the report is missing or empty we fall back to `null`.
  const fastestGrowing =
    clusters.length === 0
      ? null
      : clusters.reduce((best, c) =>
          (c.avg_weekly_growth_pct ?? 0) > (best.avg_weekly_growth_pct ?? 0)
            ? c
            : best,
        );

  // Regions with gaps = the union of `states` across all clusters.
  const regionSet = new Set<string>();
  for (const c of clusters) {
    for (const s of c.states ?? []) {
      if (s) regionSet.add(s);
    }
  }

  return {
    unanswered_demand: unansweredDemand,
    priority_gaps: priorityGaps,
    fastest_growing_topic: fastestGrowing?.theme ?? null,
    regions_with_gaps: regionSet.size,
  };
}

/**
 * Renders the four KPI cards. Each value is independently rendered so
 * the grid still shows partial data when the backend omits one field.
 */
export function KpiCards({ report }: { report?: GapReport }) {
  const kpis = deriveKpis(report);

  const items = [
    {
      key: "unanswered_demand",
      label: "Unanswered demand",
      value: kpis.unanswered_demand,
      icon: HelpCircle,
      accent: "text-amber-500",
    },
    {
      key: "priority_gaps",
      label: "Priority gaps",
      value: kpis.priority_gaps,
      icon: AlertTriangle,
      accent: "text-red-500",
    },
    {
      key: "fastest_growing_topic",
      label: "Fastest-growing topic",
      value: kpis.fastest_growing_topic ?? "—",
      icon: Sprout,
      accent: "text-emerald-500",
    },
    {
      key: "regions_with_gaps",
      label: "Regions with gaps",
      value: kpis.regions_with_gaps,
      icon: MapPin,
      accent: "text-sky-500",
    },
  ] as const;

  return (
    <ul
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      aria-label="Gap-report key performance indicators"
    >
      {items.map(({ key, label, value, icon: Icon, accent }) => (
        <li key={key}>
          <Card aria-label={`${label} KPI`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon aria-hidden="true" className={`h-4 w-4 ${accent}`} />
            </CardHeader>
            <CardContent>
              <p
                data-testid={`kpi-${key}`}
                className="text-2xl font-semibold tabular-nums"
              >
                {value === undefined || value === null ? "—" : String(value)}
              </p>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}