import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { fetchGapReport } from "../api";
import type { GapReport, GapReportFilters } from "../types";

export const gapReportQueryKey = (opts: {
  refresh?: boolean;
  filters?: GapReportFilters;
}) =>
  [
    "gdb-gap-report",
    {
      refresh: opts.refresh ?? false,
      crop: opts.filters?.crop ?? null,
      state: opts.filters?.state ?? null,
      domain: opts.filters?.domain ?? null,
    },
  ] as const;

/**
 * React-Query hook for the `POST /gdb/gap-report` endpoint.
 *
 * The Refresh button flips `refresh` to `true`, which both:
 *  - sends `refresh=true` in the JSON request body (forcing the backend
 *    to drop its in-process cache), and
 *  - changes the query key so the cached result is bypassed.
 *
 * `filters` are kept in the query key for client-side memoisation in the
 * Coverage Explorer; the backend does not currently accept them.
 */
export function useGapReport(opts: {
  refresh?: boolean;
  filters?: GapReportFilters;
  enabled?: boolean;
} = {}): UseQueryResult<GapReport, Error> {
  return useQuery<GapReport, Error>({
    queryKey: gapReportQueryKey(opts),
    queryFn: ({ signal }) => fetchGapReport({ ...opts, signal }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: opts.enabled ?? true,
  });
}