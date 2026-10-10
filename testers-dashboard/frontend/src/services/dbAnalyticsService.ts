import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type { ITesterLogEntry } from "../testerLog/types";
import type { IDbFilterOptions, ITestersDashboardSummaryResponse } from "./testersDashboardSummaryService";

const API_BASE_URL = env.apiBaseUrl();

// Client for the DB-native Database Logs Analytics endpoints (backend
// TestersDbAnalyticsController):
//   - GET /dashboard/testers/db/summary - the dashboard's figures, calculated
//     server-side from stored entries (used by DbAnalyticsSection via
//     useDbAnalyticsSummary, which falls back to the old
//     GET /dashboard/testers/summary?source=db path if this one fails).
//   - GET /dashboard/testers/db/entries - the stored entries themselves,
//     filtered in MongoDB, in their raw ITesterLogEntry shape.

// Same filter values as the DB filter bar - option values from
// dbFilterOptions, a stored Build value, or a submittedByUserId. No `source`
// or `excludeFailures`: this endpoint is DB-only.
export interface IDbAnalyticsEntriesQuery {
    dateRange?: string;
    customStart?: string;
    customEnd?: string;
    type?: string;
    category?: string;
    build?: string;
    channel?: string;
    language?: string;
    tester?: string;
    status?: string;
    severity?: string;
    // Comma-separated Type of Question options.
    dynamicSubTypes?: string;
    typeBranch?: string;
    staticSubTypes?: string;
}

// Mirrors backend's DbAnalyticsEntry: a stored entry limited to the fields
// analytics reads, _id as a string.
export type IDbAnalyticsEntry = Partial<ITesterLogEntry> & { _id: string };

// Mirrors backend's TestersDbAnalyticsEntriesResponse.
export interface IDbAnalyticsEntriesResponse {
    success: boolean;
    totalRecords: number;
    matchedRecords: number;
    entries: IDbAnalyticsEntry[];
    filterOptions: IDbFilterOptions;
    lastSyncedAt: string | null;
    error?: string;
}

const QUERY_KEYS: (keyof IDbAnalyticsEntriesQuery)[] = [
    "dateRange", "customStart", "customEnd", "type", "category", "build", "channel", "language",
    "tester", "status", "severity", "dynamicSubTypes", "typeBranch", "staticSubTypes",
];

// Mirrors backend's DbAnalyticsSummaryResponse (dbAnalytics/types.ts) - the
// dashboard cards' summary shape, calculated DB-natively.
export type IDbAnalyticsSummaryResponse = ITestersDashboardSummaryResponse & {
    calculation: "db-native";
    matchedRecords: number;
    dbFilterOptions: IDbFilterOptions;
};

function queryString(query: IDbAnalyticsEntriesQuery): string {
    const params = new URLSearchParams();
    for (const key of QUERY_KEYS) {
        const value = query[key];
        if (value && value !== "all") params.append(key, value);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : "";
}

export class DbAnalyticsService {
    private _baseUrl = `${API_BASE_URL}/dashboard/testers/db`;

    async getEntries(query: IDbAnalyticsEntriesQuery = {}): Promise<IDbAnalyticsEntriesResponse> {
        const response = await apiFetch<IDbAnalyticsEntriesResponse>(`${this._baseUrl}/entries${queryString(query)}`);
        if (!response) {
            throw new Error("Failed to fetch DB analytics entries: No response received");
        }
        return response;
    }

    // DB-native summary (GET /dashboard/testers/db/summary) - KPIs,
    // diagnostics, trend, and previous period, calculated server-side.
    async getSummary(query: IDbAnalyticsEntriesQuery = {}): Promise<IDbAnalyticsSummaryResponse> {
        const response = await apiFetch<IDbAnalyticsSummaryResponse>(`${this._baseUrl}/summary${queryString(query)}`);
        if (!response) {
            throw new Error("Failed to fetch DB analytics summary: No response received");
        }
        return response;
    }
}

export const dbAnalyticsService = new DbAnalyticsService();
