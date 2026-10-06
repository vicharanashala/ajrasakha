import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
    testersDashboardSummaryService,
    type ITestersDashboardSummaryQuery,
    type ITestersDashboardSummaryResponse,
} from "../services/testersDashboardSummaryService";
import {
    getRecordsFromBrowserStorage,
    syncAndCacheSheetsFromBackend,
    computeClientSummary,
} from "../analytics/clientSheetAnalytics.js";
import { calculateKpis, calculateChannelStats, calculateLanguageStats } from "../analytics/kpis.js";
import { calculateDiagnostics } from "../analytics/diagnostics.js";
import { calculateChartData } from "../analytics/chartData.js";
import { buildFilterOptions, type TestersDashboardFilters } from "../analytics/filters.js";

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
    dynamicSubTypes: string[] = [],
    typeBranch: string = "all",
    staticSubTypes: string[] = [],
    source: 'sheet' | 'db' = 'sheet',
) => {
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
        // Exclude Failures is Google Sheet-only - never sent for the DB source.
        excludeFailures: (source === 'sheet' && excludeFailures) || undefined,
        customStart: customStart || undefined,
        customEnd: customEnd || undefined,
        dynamicSubTypes: dynamicSubTypes.length > 0 ? dynamicSubTypes.join(",") : undefined,
        typeBranch: typeBranch !== "all" ? typeBranch : undefined,
        staticSubTypes: staticSubTypes.length > 0 ? staticSubTypes.join(",") : undefined,
    };

    const filtersObj: TestersDashboardFilters = {
        dateRange: (filters.dateRange ?? 'all') as any,
        type: 'all',
        category: filters.category ?? 'all',
        build: filters.build ?? 'all',
        channel: filters.channel ?? 'all',
        language: filters.language ?? 'all',
        tester: filters.tester ?? 'all',
        status: filters.status ?? 'all',
        severity: filters.severity ?? 'all',
        dynamicSubTypes,
        typeBranch: (typeBranch ?? 'all') as any,
        staticSubTypes,
    };

    return useQuery<ITestersDashboardSummaryResponse>({
        queryKey: ["testers-dashboard-summary", source, query],
        queryFn: async () => {
            if (source === 'sheet') {
                let stored = await getRecordsFromBrowserStorage();
                // If not in local storage yet, automatically stream and cache from Google Sheets!
                if (!stored || !stored.records || stored.records.length === 0) {
                    stored = await syncAndCacheSheetsFromBackend();
                }

                if (!stored || !stored.records || stored.records.length === 0) {
                    return {
                        success: false,
                        needClientData: true,
                        message: 'Google Sheet data could not be automatically synced. You can upload a CSV file manually.',
                        totalRecords: 0,
                        kpis: calculateKpis([]),
                        diagnostics: calculateDiagnostics([]),
                        chartData: calculateChartData([]),
                        previousPeriodStats: null,
                        filterOptions: buildFilterOptions([]),
                        lastSyncedAt: null,
                        channelStats: calculateChannelStats([]),
                        languageStats: calculateLanguageStats([]),
                    } as ITestersDashboardSummaryResponse;
                }

                return computeClientSummary(
                    stored.records,
                    filtersObj,
                    excludeFailures,
                    customStart || undefined,
                    customEnd || undefined,
                    {},
                    stored.lastSyncedAt,
                );
            }

            return testersDashboardSummaryService.getSummary(query);
        },
        staleTime: 1000 * 60 * 5, // 5 minutes
        placeholderData: keepPreviousData,
        refetchInterval: (query) => {
            const data = query.state.data;
            return data?.syncing ? 3000 : false;
        },
    });
};
