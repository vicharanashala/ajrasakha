import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type {
  GapReport,
  GapReportFilters,
  GapReportRequestBody,
} from "./types";

/**
 * Builds the absolute URL for the ACC `/gdb/gap-report` endpoint.
 *
 * The base URL is sourced from `VITE_ACC_API_BASE_URL` (falling back to
 * same-origin `/api/acc` so Vite/nginx can proxy through). The path is
 * hard-coded so the dashboard never drifts from the API contract.
 *
 * NOTE: this endpoint is `POST`, so no filters are appended to the URL.
 * Filters (`crop`, `state`, `domain`) are applied client-side in the
 * Coverage Explorer because the backend does not honour them.
 */
export function buildGapReportUrl(): string {
  const base = env.accApiBaseUrl();
  return `${base}/gdb/gap-report`;
}

/**
 * Builds the JSON request body for `POST /gdb/gap-report`.
 *
 * The body mirrors the FastAPI `GapReportRequest` Pydantic model — every
 * field is optional and defaults to the server-side defaults
 * (similarity_threshold=0.85, min_samples=2, lookback_days=None,
 * refresh=False).
 *
 * `refresh=true` drops the in-process cache before rebuilding the report
 * from MongoDB.
 */
export function buildGapReportBody(opts: {
  refresh?: boolean;
  filters?: GapReportFilters;
} = {}): GapReportRequestBody {
  // The backend does not currently accept crop/state/domain filters in
  // the request body — they are intentionally omitted. The dashboard
  // exposes them as a client-side facet on the response.
  void opts.filters;
  return {
    similarity_threshold: 0.85,
    min_samples: 2,
    lookback_days: null,
    refresh: Boolean(opts.refresh),
  };
}

/**
 * Fetches the full GDB gap-report payload from the ACC API via POST.
 *
 * Uses the project's existing `apiFetch` helper for auth headers, JSON
 * content-type, timeout handling, and 401 → /auth redirect semantics.
 * The helper already parses JSON and surfaces non-2xx responses as a
 * thrown `Error`, so we simply narrow the result and let React Query
 * handle retry / error rendering.
 */
export async function fetchGapReport(opts: {
  refresh?: boolean;
  filters?: GapReportFilters;
  signal?: AbortSignal;
} = {}): Promise<GapReport> {
  const url = buildGapReportUrl();
  const body = buildGapReportBody(opts);
  const data = await apiFetch<GapReport>(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  if (!data) {
    throw new Error("Gap report response was empty");
  }
  return data;
}