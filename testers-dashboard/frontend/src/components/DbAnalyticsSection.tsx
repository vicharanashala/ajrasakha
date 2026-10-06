import { useTestersDashboardSummary } from "../hooks/useTestersDashboardSummary";
import { useAnalyticsFilterState } from "../hooks/useAnalyticsFilterState";
import { useAnalyticsViewState } from "../hooks/useAnalyticsViewState";
import { AnalyticsDashboardBody } from "./AnalyticsDashboardBody";
import { AnalyticsSectionHeader, formatLastUpdated } from "./AnalyticsSectionHeader";

export interface DbAnalyticsSectionProps {
  title?: string;
  description?: string;
  sourceBadge?: string;
}

// Database Logs Analytics - tester-entered entries from MongoDB
// (tester_test_cases), summarized server-side via
// GET /dashboard/testers/summary?source=db. Has no Exclude Failures toggle
// and no sheet sync/upload controls - those are Google Sheet-only.
export function DbAnalyticsSection({
  title = "Database Logs Analytics",
  description = "Analytics computed live from tester_test_cases collection in database",
  sourceBadge,
}: DbAnalyticsSectionProps) {
  const filterState = useAnalyticsFilterState();

  const summaryQuery = useTestersDashboardSummary(
    filterState.filters,
    // Exclude Failures is a Google Sheet-only control - never applied to DB analytics.
    false,
    filterState.customStart,
    filterState.customEnd,
    filterState.dynamicSubTypes,
    filterState.typeBranch,
    filterState.staticSubTypes,
    "db",
  );

  const viewState = useAnalyticsViewState(summaryQuery.data?.diagnostics);

  if (summaryQuery.isLoading || !summaryQuery.data) {
    return <div className="p-6 text-muted-foreground">Loading {title.toLowerCase()} data...</div>;
  }

  if (summaryQuery.isError || !summaryQuery.data.success) {
    const errorDetail = summaryQuery.data?.error;
    return (
      <div className="p-6 text-destructive">
        <p className="font-semibold">Failed to load {title.toLowerCase()} data.</p>
        <p className="text-sm mt-1 text-muted-foreground">{errorDetail || "Check database connectivity."}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnalyticsSectionHeader title={title} description={description} sourceBadge={sourceBadge}>
        <div className="flex items-start gap-3 text-sm">
          <div className="flex flex-col text-left">
            <span className="text-muted-foreground">Loaded {summaryQuery.data.totalRecords} records.</span>
            <span className="text-muted-foreground">
              Last synced: {formatLastUpdated(summaryQuery.data.lastSyncedAt ?? null)}
            </span>
          </div>
        </div>
      </AnalyticsSectionHeader>

      <AnalyticsDashboardBody data={summaryQuery.data} filterState={filterState} viewState={viewState} />
    </div>
  );
}
