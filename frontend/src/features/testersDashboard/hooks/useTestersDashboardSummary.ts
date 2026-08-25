import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
    testersDashboardSummaryService,
    type ITestersDashboardSummaryQuery,
    type ITestersDashboardSummaryResponse,
} from "@/hooks/services/testersDashboardSummaryService";

// Matches TestersDashboard.tsx's EMPTY_FILTERS shape (dateRange + the 8
// remaining single-select filter dimensions - "type" was replaced by the
// Dynamic/Static tree control and is no longer part of this shape; see
// typeBranch/staticSubTypes params below).
export interface ITestersDashboardFiltersState {
    dateRange: string;
    category: string;
    build: string;
    channel: string;
    language: string;
    tester: string;
    status: string;
    severity: string;
}

export const useTestersDashboardSummary = (
    filters: ITestersDashboardFiltersState,
    excludeFailures: boolean,
    customStart: string,
    customEnd: string,
    // Multi-select OR filter on Dynamic's sub-components, independent of
    // filters.type - not part of ITestersDashboardFiltersState since it's a
    // string[], not one of the single-value "all"/selected-value fields
    // that shape represents (same reason customStart/customEnd are their
    // own params rather than folded into filters).
    dynamicSubTypes: string[] = [],
    // Dynamic/Static tree's whole-branch selection ("all" | "Dynamic" |
    // "Static") and Static's sub-types (GDB/Unique/Outreach, multi-select
    // OR - same shape/semantics as dynamicSubTypes above) - own params for
    // the same reason dynamicSubTypes is: they're driven by the tree
    // control, not the single-value filter dropdowns.
    typeBranch: string = "all",
    staticSubTypes: string[] = [],
) => {
    // "all" means "no filter" on both sides (EMPTY_FILTERS default), so it's
    // omitted here rather than sent literally - keeps query strings clean
    // and matches GetTestersDashboardQuery's own "?? EMPTY_FILTERS.x"
    // defaulting when a param is absent.
    const query: ITestersDashboardSummaryQuery = {
        dateRange: filters.dateRange !== "all" ? filters.dateRange : undefined,
        category: filters.category !== "all" ? filters.category : undefined,
        build: filters.build !== "all" ? filters.build : undefined,
        channel: filters.channel !== "all" ? filters.channel : undefined,
        language: filters.language !== "all" ? filters.language : undefined,
        tester: filters.tester !== "all" ? filters.tester : undefined,
        status: filters.status !== "all" ? filters.status : undefined,
        severity: filters.severity !== "all" ? filters.severity : undefined,
        excludeFailures: excludeFailures || undefined,
        customStart: customStart || undefined,
        customEnd: customEnd || undefined,
        dynamicSubTypes: dynamicSubTypes.length > 0 ? dynamicSubTypes.join(",") : undefined,
        typeBranch: typeBranch !== "all" ? typeBranch : undefined,
        staticSubTypes: staticSubTypes.length > 0 ? staticSubTypes.join(",") : undefined,
    };

    return useQuery<ITestersDashboardSummaryResponse>({
        // Includes the full query object so a change to any filter,
        // excludeFailures, the custom date range, or dynamicSubTypes
        // triggers a refetch - matching how the old client-side
        // `filtered`/`kpis` useMemo blocks recompute on the same
        // dependencies.
        queryKey: ["testers-dashboard-summary", query],
        queryFn: () => testersDashboardSummaryService.getSummary(query),
        staleTime: 1000 * 60 * 5, // 5 minutes
        // Every distinct filter combination is its own queryKey/cache entry,
        // so without this, picking a Custom Range date (or any other
        // never-before-seen filter combination) makes React Query treat it
        // as a brand-new query with no data - isLoading briefly goes true,
        // and TestersDashboard's `if (isLoading || summaryQuery.isLoading...)
        // return <Loading/>` early-return unmounts the ENTIRE filter bar
        // (Start/End inputs included) for that fetch's duration. A click on
        // End right after setting Start would land during/right after that
        // unmount and get silently swallowed - reported as "End is
        // unresponsive," but not actually End-specific. keepPreviousData
        // keeps the last-fetched data (and `data`/`isLoading`) visible while
        // the new query resolves in the background, so the filter bar never
        // disappears on a filter change.
        placeholderData: keepPreviousData,
    });
};
