import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { dbAnalyticsService, type IDbAnalyticsEntriesQuery } from "../services/dbAnalyticsService";
import {
    testersDashboardSummaryService,
    type ITestersDashboardSummaryResponse,
} from "../services/testersDashboardSummaryService";
import type { ITestersDashboardFiltersState } from "./useTestersDashboardSummary";

// Database Logs Analytics summary. Uses the DB-native calculation path
// (GET /dashboard/testers/db/summary). Until it is verified everywhere, a
// failed DB-native request (e.g. a backend not yet rebuilt with that route)
// falls back to the previous GET /dashboard/testers/summary?source=db path,
// marked calculation: "legacy-source-db" so the section can say so.
export const useDbAnalyticsSummary = (
    filters: ITestersDashboardFiltersState,
    customStart: string,
    customEnd: string,
    dynamicSubTypes: string[] = [],
    typeBranch: string = "all",
    staticSubTypes: string[] = [],
) => {
    const query: IDbAnalyticsEntriesQuery = {
        dateRange: filters.dateRange,
        category: filters.category,
        build: filters.build,
        channel: filters.channel,
        language: filters.language,
        tester: filters.tester,
        status: filters.status,
        severity: filters.severity,
        customStart: customStart || undefined,
        customEnd: customEnd || undefined,
        dynamicSubTypes: dynamicSubTypes.length > 0 ? dynamicSubTypes.join(",") : undefined,
        typeBranch,
        staticSubTypes: staticSubTypes.length > 0 ? staticSubTypes.join(",") : undefined,
    };

    return useQuery<ITestersDashboardSummaryResponse>({
        // Under the same "testers-dashboard-summary" prefix the Tester Data
        // edit/delete actions invalidate.
        queryKey: ["testers-dashboard-summary", "db-native", query],
        queryFn: async () => {
            try {
                const summary = await dbAnalyticsService.getSummary(query);
                if (summary.success) return summary;
                console.warn("[DB Analytics] DB-native summary failed, using the source=db fallback:", summary.error);
            } catch (err) {
                console.warn("[DB Analytics] DB-native summary unavailable, using the source=db fallback:", err);
            }
            const legacy = await testersDashboardSummaryService.getSummary({
                source: "db",
                ...Object.fromEntries(Object.entries(query).filter(([, v]) => v && v !== "all")),
            });
            return { ...legacy, calculation: "legacy-source-db" };
        },
        staleTime: 1000 * 60 * 5,
        placeholderData: keepPreviousData,
    });
};
