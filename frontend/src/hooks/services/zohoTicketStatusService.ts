import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface IZohoTicketStatus {
    ticketId: string;
    status: string;
    lastCheckedAt: string;
}

export interface IZohoTicketStatusResponse {
    success: boolean;
    statuses: Record<string, IZohoTicketStatus>;
}

export class ZohoTicketStatusService {
    private _baseUrl = `${API_BASE_URL}/dashboard/testers`;

    async getStatuses(): Promise<IZohoTicketStatusResponse> {
        const response = await apiFetch<IZohoTicketStatusResponse>(
            `${this._baseUrl}/zoho-status`,
        );

        if (!response) {
            throw new Error("Failed to fetch Zoho ticket statuses: No response received");
        }

        return response;
    }
}

export const zohoTicketStatusService = new ZohoTicketStatusService();