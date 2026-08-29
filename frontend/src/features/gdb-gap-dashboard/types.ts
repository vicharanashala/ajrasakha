/**
 * Typed contract for the ACC `POST /gdb/gap-report` endpoint.
 *
 * The response shape mirrors `gdb_gap_detector.GapReport.to_dict()` and
 * `GapCluster.to_dict()` — see `apis/acc_api/gdb_gap_detector.py`. Every
 * field is intentionally optional so the dashboard degrades gracefully
 * when the backend omits a key (e.g. an empty `recommendations` list).
 *
 * Endpoint:    POST {accApiBaseUrl}/gdb/gap-report
 * Body schema: GapReportRequest = {
 *                similarity_threshold?: float  (0..1, default 0.85),
 *                min_samples?:          int    (1..50, default 2),
 *                lookback_days?:        int | null,
 *                refresh?:              bool   (default false),
 *              }
 *
 * Setting `refresh=true` in the body drops the server-side cache before
 * rebuilding the report from MongoDB. The backend does **not** honour
 * filter parameters (crop, state, domain) on the wire — the Coverage
 * Explorer therefore applies those facets on the client.
 */

export type CoverageState = "STRONG" | "PARTIAL" | "GAP" | string;

/** Priority bucket used by the backend's `gaps_by_priority` map. */
export type PriorityBucket = "critical" | "high" | "medium" | "low" | string;

/**
 * One cluster entry — matches `GapCluster.to_dict()` from the backend.
 *
 * The dashboard treats the *shape* of this object as the source of truth
 * for the Priority Gap table, KPI cards, Top Growing Topics chart, and
 * the Coverage Explorer.
 */
export interface GapClusterItem {
  cluster_id: string;
  theme: string;

  /** Unanswered farmer queries inside the current demand window. */
  query_count: number;
  recent_query_count: number;
  previous_query_count: number;
  total_query_count: number;

  /** Period-over-period growth (e.g. 0.42 == +42%). */
  avg_weekly_growth_pct: number;

  domain: string;
  crops: string[];
  states: string[];
  top_crop: string;
  top_state: string;

  priority: PriorityBucket;
  priority_score: number;

  gdb_coverage_band: CoverageState;
  gdb_coverage_hits: number;
  gdb_coverage_score: number;

  suggested_action: string;
  sample_queries: string[];
}

/**
 * Time window covered by the report. The backend currently returns a
 * `{start, end, days}` dict (ISO-8601 strings).
 */
export interface GapReportWindow {
  start?: string;
  end?: string;
  days?: number;
  [extra: string]: unknown;
}

/**
 * The full response of `POST /gdb/gap-report`.
 *
 * Modeled against `GapReport.to_dict()` — every field is optional so the
 * UI can render partial data if the backend ever returns a slimmed-down
 * payload.
 */
export interface GapReport {
  report_id?: string;
  generated_at?: string;

  window?: GapReportWindow;

  total_queries_analyzed?: number;
  total_clusters_found?: number;

  /**
   * Map keyed by priority bucket. The backend currently returns either:
   *   { "critical": ClusterSummary[], "high": [...], ... }
   * or `null` for empty buckets. The dashboard flattens this into the
   * priority gap table.
   */
  gaps_by_priority?: Partial<Record<PriorityBucket, GapClusterItem[]>> | null;

  /**
   * Coverage-band summary, keyed by band label
   * (`STRONG` | `PARTIAL` | `GAP`). Used by the Coverage Explorer header.
   */
  coverage_bands?: Partial<Record<CoverageState, number | GapClusterItem[]>> | null;

  /**
   * Top clusters ranked by demand + growth (the table data source).
   */
  top_gaps?: GapClusterItem[];

  /** Optional heatmap; the dashboard does not currently render it. */
  coverage_heatmap?: unknown;

  /**
   * Plain-text outreach recommendations.  The backend currently returns
   * strings, but the dashboard also accepts structured objects if the
   * shape evolves.
   */
  recommendations?: (string | { title?: string; description?: string })[] | null;

  /** Full cluster list — the source for KPI derivations and the chart. */
  clusters?: GapClusterItem[];
}

/** Body shape accepted by the POST endpoint. */
export interface GapReportRequestBody {
  similarity_threshold?: number;
  min_samples?: number;
  lookback_days?: number | null;
  refresh?: boolean;
}

/** Optional UI-side facets (applied client-side; the backend ignores them). */
export interface GapReportFilters {
  crop?: string;
  state?: string;
  domain?: string;
}