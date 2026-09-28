import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface ITestersDashboardRecord {
    [key: string]: string;
}

export interface ITestersDashboardDataResponse {
    success: boolean;
    totalRecords: number;
    records: ITestersDashboardRecord[];
    lastSyncedAt: string | null;
}

export class TestersDashboardService {
    private _baseUrl = `${API_BASE_URL}/dashboard/testers`;

    async getData(source?: 'sheet' | 'db'): Promise<ITestersDashboardDataResponse> {
        const url = source ? `${this._baseUrl}/data?source=${source}` : `${this._baseUrl}/data`;
        const response = await apiFetch<ITestersDashboardDataResponse>(url);

        if (!response) {
            throw new Error("Failed to fetch testers dashboard data: No response received");
        }

        return response;
    }
}

export const testersDashboardService = new TestersDashboardService();
