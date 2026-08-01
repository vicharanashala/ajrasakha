import { apiFetch } from "../api/api-fetch";
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

    async getData(): Promise<ITestersDashboardDataResponse> {
        const response = await apiFetch<ITestersDashboardDataResponse>(
            `${this._baseUrl}/data`,
        );

        if (!response) {
            throw new Error("Failed to fetch testers dashboard data: No response received");
        }

        return response;
    }
}

export const testersDashboardService = new TestersDashboardService();
