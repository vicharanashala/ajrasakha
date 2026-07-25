export interface TestersDashboardRecord {
    [key: string]: string;
}

export interface TestersDashboardDataResponse {
    success: boolean;
    totalRecords: number;
    records: TestersDashboardRecord[];
}

export interface ITestersDashboardService {
    getData(): Promise<TestersDashboardDataResponse>;
}