import { apiFetch } from "@/hooks/api/api-fetch";
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

// GET /dashboard/testers/zoho-status - every Zoho Desk Bugs Tracker ticket,
// fetched directly from Zoho by the backend on request (no scheduled sync).
export interface IZohoTicketStatusResponse {
    success: boolean;
    statuses: Record<string, IZohoTicketStatus>;
    // When the backend fetched these from Zoho (null if never fetched).
    fetchedAt?: string | null;
    // True when Zoho couldn't be reached and these are the previous fetch's statuses.
    stale?: boolean;
    // False when the backend has no Zoho credentials configured.
    configured?: boolean;
    error?: string;
}

export interface ZohoTeam {
    id: string;
    name: string;
}

export interface IZohoTeamsResponse {
    success: boolean;
    teams: ZohoTeam[];
}

export interface ZohoAttachmentInput {
    filename: string;
    contentBase64: string;
    contentType?: string;
    inlineBase64?: string;
}

export interface CreateZohoTicketParams {
    subject: string;
    description: string;
    priority?: string;
    email?: string;
    testerName?: string;
    departmentId?: string;
    teamId?: string;
    appName?: string;
    issueReoccurredBefore?: boolean;
    dueDate?: string;
    attachments?: ZohoAttachmentInput[];
}

export interface CreatedZohoTicket {
    ticketId: string;
    ticketNumber: string | null;
    url: string;
    status: string;
    attachmentsUploaded?: number;
}

export interface CreateZohoTicketResponse {
    success: boolean;
    ticket?: CreatedZohoTicket;
    error?: string;
    requiresScopeUpgrade?: boolean;
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

    async getTeams(): Promise<IZohoTeamsResponse> {
        const response = await apiFetch<IZohoTeamsResponse>(
            `${this._baseUrl}/zoho-teams`,
        );

        if (!response) {
            throw new Error("Failed to fetch Zoho teams: No response received");
        }

        return response;
    }

    async createTicket(params: CreateZohoTicketParams): Promise<CreateZohoTicketResponse> {
        const response = await apiFetch<CreateZohoTicketResponse>(
            `${this._baseUrl}/zoho-ticket`,
            {
                method: "POST",
                body: JSON.stringify(params),
            },
        );

        if (!response) {
            throw new Error("Failed to create Zoho ticket: No response received");
        }

        return response;
    }
}

export const zohoTicketStatusService = new ZohoTicketStatusService();