import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface IZohoTicketStatus {
    ticketId: string;
    status: string;
    // The ticket's Team field in Zoho Desk (not the individual assignee) -
    // null when Zoho has no team set on the ticket.
    team: string | null;
    // Zoho's short human-facing ticket number (e.g. "539") - distinct from
    // the long internal ticket id used for lookups/links. Null when Zoho
    // hasn't returned one yet (e.g. not synced).
    ticketNumber: string | null;
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