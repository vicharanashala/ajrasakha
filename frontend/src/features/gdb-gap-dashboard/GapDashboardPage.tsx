import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, BarChart3 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Skeleton } from "@/components/atoms/skeleton";
import { KpiCards } from "./components/KpiCards";
import { PriorityGapTable } from "./components/PriorityGapTable";
import { TopGrowingTopicsChart } from "./components/TopGrowingTopicsChart";
import { CoverageExplorer } from "./components/CoverageExplorer";
import { Recommendations } from "./components/Recommendations";
import { useGapReport } from "./hooks/useGapReport";
import type { GapClusterItem, GapReportFilters } from "./types";

/**
 * Top-level page for the `/gdb/gap-report` dashboard.
 *
 * Responsibilities:
 *  - Pull the report via TanStack Query (`useGapReport`)
 *  - Manage the `refresh=true` body flag (default off → cached report)
 *  - Manage the (crop, state, domain) facets for the client-side
 *    coverage explorer (the backend ignores these)
 *  - Render the loading / empty / error states the spec calls for
 *
 * The page is intentionally framework-light: every visual concern lives
 * in its own sub-component so they can be unit-tested in isolation.
 */
export function GapDashboardPage() {
  const [refresh, setRefresh] = useState(false);
  const [crop, setCrop] = useState<string | undefined>();
  const [stateFilter, setStateFilter] = useState<string | undefined>();
  const [domain, setDomain] = useState<string | undefined>();

  const filters: GapReportFilters = useMemo(
    () => ({
      ...(crop ? { crop } : {}),
      ...(stateFilter ? { state: stateFilter } : {}),
      ...(domain ? { domain } : {}),
    }),
    [crop, stateFilter, domain],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useGapReport({
    refresh,
    filters,
  });

  const handleRefresh = useCallback(() => {
    setRefresh(true);
    // Force the request to refetch immediately with `refresh=true` in
    // the body so the backend drops its in-process cache.
    refetch();
  }, [refetch]);

  const isInitialLoad = isLoading && !data;

  // Flatten the gap table rows from either `top_gaps` (preferred) or a
  // sweep across every `gaps_by_priority` bucket.
  const priorityGapRows: GapClusterItem[] = useMemo(() => {
    if (data?.top_gaps && data.top_gaps.length > 0) return data.top_gaps;
    if (data?.gaps_by_priority && typeof data.gaps_by_priority === "object") {
      const flat: GapClusterItem[] = [];
      for (const bucket of Object.values(data.gaps_by_priority)) {
        if (Array.isArray(bucket)) {
          for (const item of bucket) {
            if (item) flat.push(item);
          }
        }
      }
      return flat;
    }
    return [];
  }, [data]);

  const hasData =
    !!data &&
    ((data.clusters?.length ?? 0) > 0 ||
      priorityGapRows.length > 0 ||
      (data.recommendations?.length ?? 0) > 0 ||
      (data.coverage_bands ? Object.keys(data.coverage_bands).length > 0 : false));

  const generatedAt = data?.generated_at
    ? new Date(data.generated_at).toLocaleString()
    : null;

  const windowLabel =
    data?.window?.start && data?.window?.end
      ? `${data.window.start} → ${data.window.end}` +
        (data.window.days ? ` (${data.window.days} days)` : "")
      : null;

  return (
    <main
      className="min-h-screen bg-background"
      aria-labelledby="gdb-gap-dashboard-title"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
        {/* Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1
              id="gdb-gap-dashboard-title"
              className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
            >
              <BarChart3 aria-hidden="true" className="h-6 w-6 text-primary" />
              GDB Coverage Gap Report
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Demand-side signals vs. Golden Dataset coverage, refreshed from
              the ACC{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">
                /gdb/gap-report
              </code>{" "}
              endpoint.
              {generatedAt ? ` Last generated ${generatedAt}.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {windowLabel && (
              <span className="inline-flex items-center rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground">
                Window: {windowLabel}
              </span>
            )}
            <Button
              type="button"
              onClick={handleRefresh}
              disabled={isFetching}
              aria-label="Refresh gap report from the server"
              data-testid="gap-report-refresh"
            >
              <RefreshCw
                aria-hidden="true"
                className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
              />
              {isFetching ? "Refreshing…" : "Refresh"}
            </Button>
          </div>
        </header>

        {/* Body */}
        {isError ? (
          <ErrorState
            message={
              error instanceof Error
                ? error.message
                : "Unable to load the gap report."
            }
            onRetry={handleRefresh}
          />
        ) : isInitialLoad ? (
          <LoadingState />
        ) : !hasData ? (
          <EmptyState onRefresh={handleRefresh} isFetching={isFetching} />
        ) : (
          <div
            className="grid gap-6"
            data-testid="gap-report-content"
            aria-busy={isFetching}
          >
            <KpiCards report={data} />

            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>Priority gaps</CardTitle>
                  <CardDescription>
                    Searchable and sortable list of the most urgent
                    (crop × state × domain) coverage gaps surfaced by the
                    pipeline. Expand a row to inspect sample farmer questions.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PriorityGapTable gaps={priorityGapRows} />
                </CardContent>
              </Card>
              <div className="space-y-6">
                <TopGrowingTopicsChart clusters={data?.clusters} />
                <Recommendations report={data} />
              </div>
            </div>

            <CoverageExplorer
              clusters={data?.clusters ?? []}
              bands={data?.coverage_bands}
              crop={crop}
              state={stateFilter}
              domain={domain}
              onCropChange={setCrop}
              onStateChange={setStateFilter}
              onDomainChange={setDomain}
            />
          </div>
        )}
      </div>
    </main>
  );
}

/* ----------------------------- sub-components ----------------------------- */

function LoadingState() {
  return (
    <div
      className="grid gap-6"
      role="status"
      aria-live="polite"
      aria-label="Loading gap report"
      data-testid="gap-report-loading"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}

function EmptyState({
  onRefresh,
  isFetching,
}: {
  onRefresh: () => void;
  isFetching: boolean;
}) {
  return (
    <Card data-testid="gap-report-empty" role="status">
      <CardHeader>
        <CardTitle>No gap report yet</CardTitle>
        <CardDescription>
          The pipeline has not produced any data for this account. This
          usually resolves itself once the cron job has had a chance to run
          after the first day of activity.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          type="button"
          onClick={onRefresh}
          disabled={isFetching}
          aria-label="Trigger a fresh gap-report fetch"
        >
          <RefreshCw
            aria-hidden="true"
            className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <Card
      data-testid="gap-report-error"
      role="alert"
      className="border-red-200 bg-red-50"
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-red-700">
          <AlertTriangle aria-hidden="true" className="h-5 w-5" />
          Could not load the gap report
        </CardTitle>
        <CardDescription className="text-red-700/80">
          {message}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}

export default GapDashboardPage;