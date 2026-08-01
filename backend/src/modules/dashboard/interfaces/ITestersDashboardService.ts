export interface TestersDashboardRecord {
    [key: string]: string;
}

export interface TestersDashboardDataResponse {
    success: boolean;
    totalRecords: number;
    records: TestersDashboardRecord[];
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
     * Fetches the latest data from the live Google Sheet and overwrites
     * updated.csv with it, so getData() picks up fresh data on next call.
     */
    syncFromSheet(): Promise<void>;
}
