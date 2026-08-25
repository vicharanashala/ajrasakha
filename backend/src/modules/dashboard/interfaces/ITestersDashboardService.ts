import type { KpiSummary, PreviousPeriodStats } from '../testersDashboard/kpis.js';
import type { DiagnosticsResult } from '../testersDashboard/diagnostics.js';
import type { ChartData } from '../testersDashboard/chartData.js';
import type { GetTestersDashboardQuery } from '../validators/TestersDashboardValidators.js';

export interface TestersDashboardRecord {
    [key: string]: string;
}

export interface TestersDashboardDataResponse {
    success: boolean;
    totalRecords: number;
    records: TestersDashboardRecord[];
    lastSyncedAt: string | null;
}

export interface TestersDashboardSummaryResponse {
    success: boolean;
    totalRecords: number;
    kpis: KpiSummary;
    diagnostics: DiagnosticsResult;
    chartData: ChartData;
    previousPeriodStats: PreviousPeriodStats | null;
    filterOptions: Record<string, string[]>;
    lastSyncedAt: string | null;
}

export interface ITestersDashboardService {
    /**
     * Reads and parses the ACE QA tracking CSV, same shape/quirks as the
     * standalone outreach_stt dashboard: finds the "Test ID," header row and
     * skips boilerplate rows above it, then filters out blank/"Project:" rows.
     */
    getData(): Promise<TestersDashboardDataResponse>;

    /**
     * Server-side-filtered/computed dashboard summary: applies the given
     * query's filters to the cached records, then returns the resulting
     * KPIs, diagnostics (Biggest Bottleneck, Weakest Modules, Open Critical
     * Defects), the daily trend chart data, the "vs previous period"
     * comparison, and filter-dropdown options built from the full
     * (unfiltered) dataset.
     */
    getSummary(query: GetTestersDashboardQuery): Promise<TestersDashboardSummaryResponse>;

    /**
     * Fetches the latest data from the live Google Sheet and overwrites
     * updated.csv with it, so getData() picks up fresh data on next call.
     */
    syncFromSheet(): Promise<void>;
}
