import type { KpiSummary, PreviousPeriodStats, ChannelPerformanceStat, LanguagePerformanceStat } from '../testersDashboard/kpis.js';
import type { DiagnosticsResult } from '../testersDashboard/diagnostics.js';
import type { ChartData } from '../testersDashboard/chartData.js';
import type { GetTestersDashboardQuery } from '../validators/TestersDashboardValidators.js';
import type { DbFilterOptions } from '../services/dbFilterOptions.js';

export interface TestersDashboardRecord {
    [key: string]: string;
}

export interface TestersDashboardDataResponse {
    success: boolean;
    totalRecords: number;
    records: TestersDashboardRecord[];
    lastSyncedAt: string | null;
    error?: string;
}

export interface TestersDashboardSummaryResponse {
    success: boolean;
    syncing?: boolean;
    needClientData?: boolean;
    message?: string;
    totalRecords: number;
    kpis: KpiSummary;
    diagnostics: DiagnosticsResult;
    chartData: ChartData;
    previousPeriodStats: PreviousPeriodStats | null;
    filterOptions: Record<string, string[]>;
    // DB source only: Tester UI-based filter options with per-option counts
    // from stored entries, zero-count options included (see dbFilterOptions.ts).
    dbFilterOptions?: DbFilterOptions;
    lastSyncedAt: string | null;
    // Channel-wise Performance / Language Performance cards (see kpis.ts). Computed over the
    // same filtered row set as kpis/diagnostics/chartData above, so they react to every filter
    // (including the Dynamic/Static tree) the same way.
    channelStats: ChannelPerformanceStat[];
    languageStats: LanguagePerformanceStat[];
    error?: string;
}

export interface SheetSourceInfo {
    index: number;
    label: string;
    tab: string;
}

export interface ITestersDashboardService {
    /**
     * Reads QA tracking records from Google Sheet CSV (source='sheet') or
     * MongoDB tester_test_cases collection (source='db').
     */
    getData(source?: 'sheet' | 'db'): Promise<TestersDashboardDataResponse>;

    /**
     * Server-side-filtered/computed dashboard summary: applies the query's filters to the
     * cached records and returns the resulting KPIs, diagnostics, daily trend chart data,
     * "vs previous period" comparison, and filter-dropdown options built from the full
     * (unfiltered) dataset.
     */
    getSummary(query: GetTestersDashboardQuery): Promise<TestersDashboardSummaryResponse>;

    /**
     * No-op on server to ensure 0 server RAM & heap usage.
     */
    syncFromSheet(): Promise<void>;

    /**
     * Returns the list of configured Google Sheet sources (index, label, tab).
     */
    getSheetSources(): SheetSourceInfo[];

    /**
     * Zero-buffer streaming pipe: connects Google Sheets API response stream directly
     * to the Express client response socket, using ~16 KB transient buffer and 0 disk/heap.
     */
    streamSheet(index: number, res: any): Promise<void>;
}
