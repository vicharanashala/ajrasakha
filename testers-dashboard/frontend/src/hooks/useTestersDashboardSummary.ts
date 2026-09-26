import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
    testersDashboardSummaryService,
    type ITestersDashboardSummaryQuery,
    type ITestersDashboardSummaryResponse,
} from "../services/testersDashboardSummaryService";

// Matches TestersDashboard.tsx's EMPTY_FILTERS shape (dateRange + the
// remaining single-select filter dimensions). The Dynamic/Static tree
// control's typeBranch/staticSubTypes are separate params below.
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
    // Multi-select OR filter on Dynamic's sub-components - a string[], not
    // part of ITestersDashboardFiltersState (which is single-value fields
    // only), same reason customStart/customEnd are their own params.
    dynamicSubTypes: string[] = [],
    // Dynamic/Static tree's whole-branch selection ("all" | "Dynamic" |
    // "Static") and Static's sub-types (GDB/Unique/Outreach, multi-select
    // OR) - driven by the tree control, not the single-value filter dropdowns.
    typeBranch: string = "all",
    staticSubTypes: string[] = [],
    source: 'sheet' | 'db' = 'sheet',
) => {
    // "all" means "no filter" (EMPTY_FILTERS default), so it's omitted here
    // rather than sent literally - keeps query strings clean and matches
    // the backend's own defaulting when a param is absent.
    const query: ITestersDashboardSummaryQuery = {
        source,
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
        // triggers a refetch.
        queryKey: ["testers-dashboard-summary", source, query],
        queryFn: () => testersDashboardSummaryService.getSummary(query),
        staleTime: 1000 * 60 * 5, // 5 minutes
        // Every distinct filter combination is its own queryKey/cache entry.
        // Without keepPreviousData, a never-before-seen combination (e.g. a
        // new Custom Range date) briefly returns isLoading=true, and
        // TestersDashboard's loading early-return unmounts the entire filter
        // bar (Start/End inputs included) for that fetch's duration - a
        // click on End right after Start can land mid-unmount and get
        // silently swallowed. keepPreviousData keeps the last-fetched data
        // visible while the new query resolves, so the filter bar never
        // disappears on a filter change. Do not remove.
        placeholderData: keepPreviousData,
    });
};
