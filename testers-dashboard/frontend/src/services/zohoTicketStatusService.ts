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

export interface IZohoTicketStatusResponse {
    success: boolean;
    statuses: Record<string, IZohoTicketStatus>;
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