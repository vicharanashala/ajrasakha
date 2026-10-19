import { useDbAnalyticsSummary } from "../hooks/useDbAnalyticsSummary";
import { useAnalyticsFilterState } from "../hooks/useAnalyticsFilterState";
import { useAnalyticsViewState } from "../hooks/useAnalyticsViewState";
import { AnalyticsDashboardBody } from "./AnalyticsDashboardBody";
import { AnalyticsSectionHeader, formatLastUpdated } from "./AnalyticsSectionHeader";
import { DB_FILTER_FIELDS, DB_TYPE_TREE, dbTypeTreeWithCounts } from "./dbFilterFields";

export interface DbAnalyticsSectionProps {
  title?: string;
  description?: string;
  sourceBadge?: string;
}

// Database Logs Analytics - tester-entered entries from MongoDB
// (tester_test_cases), calculated server-side by the DB-native path
// (GET /dashboard/testers/db/summary; see useDbAnalyticsSummary for the
// source=db fallback). Has no Exclude Failures toggle and no sheet
// sync/upload controls - those are Google Sheet-only.
export function DbAnalyticsSection({
  title = "Database Logs Analytics",
  description = "Analytics computed live from tester_test_cases collection in database",
  sourceBadge,
}: DbAnalyticsSectionProps) {
  const filterState = useAnalyticsFilterState(DB_TYPE_TREE);

  // DB-native calculations (GET /dashboard/testers/db/summary), falling back
  // to the old source=db summary if that request fails. No Exclude Failures -
  // a Google Sheet-only control.
  const summaryQuery = useDbAnalyticsSummary(
    filterState.filters,
    filterState.customStart,
    filterState.customEnd,
    filterState.dynamicSubTypes,
    filterState.typeBranch,
    filterState.staticSubTypes,
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
            {summaryQuery.data.calculation === "legacy-source-db" && (
              <span className="text-xs text-amber-600" role="status">
                Showing the previous DB calculation (fallback) - the DB-native summary is unavailable.
              </span>
            )}
          </div>
        </div>
      </AnalyticsSectionHeader>

      <AnalyticsDashboardBody
        data={summaryQuery.data}
        filterState={filterState}
        viewState={viewState}
        filterFields={DB_FILTER_FIELDS}
        optionDetails={summaryQuery.data.dbFilterOptions?.fields}
        typeTree={dbTypeTreeWithCounts(summaryQuery.data.dbFilterOptions)}
      />
    </div>
  );
}
