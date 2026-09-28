export interface ZohoTicketStatus {
    ticketId: string;
    status: string; // "Open", "Closed", "On Hold", etc.
    // Owning team's name, resolved via the `?include=team` param on the ticket fetch - not
    // the same as the ticket's individual assignee. Null when Zoho has no team set.
    team: string | null;
    // Zoho's short human-facing ticket number (e.g. "539"), distinct from the long internal
    // `ticketId` used for lookups/URLs. Null when Zoho hasn't returned one yet.
    ticketNumber: string | null;
    // Zoho's raw `priority` field value (e.g. "P0 - Critical"), kept alongside `severity` so
    // the mapping rule that produced it (mapZohoPriorityToSeverity) stays inspectable.
    priority: string | null;
    // Display severity, derived from `priority` via mapZohoPriorityToSeverity. This is the
    // ONE severity source the ticket card uses; the Executive Summary's Critical Defects tile
    // (kpis.ts) uses a separate, sheet-based severity definition unaffected by this.
    severity: string;
    // Ticket's Zoho Desk web URL - Zoho's own `webUrl` when present, else built from
    // ZOHO_PORTAL_URL + ticketId. Not sourced from the sheet's Defect ID / Bug Ref column.
    url: string;
    lastCheckedAt: string;
}

export interface IZohoTicketStatusService {
    /**
     * Pages through Zoho Desk's ticket list endpoint, keeps only tickets in the "Bugs
     * Tracker" layout (other products' layouts are excluded), and replaces the cache
     * wholesale. This is the ticket card's ONLY source of tickets - not the sheet.
     */
    syncAllBugsTrackerTickets(): Promise<void>;

    /**
     * Returns whatever statuses are currently cached (does not hit Zoho).
     */
    getCachedStatuses(): Record<string, ZohoTicketStatus>;

    /**
     * Creates a new ticket in Zoho Desk and returns the created ticket details.
     */
    createTicket(params: CreateZohoTicketParams): Promise<CreateZohoTicketResponse>;

    /**
     * Fetches all available Zoho Desk teams for ticket owner assignment.
     */
    getTeams(): Promise<ZohoTeam[]>;
}

export interface ZohoTeam {
    id: string;
    name: string;
}

export interface ZohoAttachmentInput {
    filename: string;
    contentBase64: string; // Base64-encoded file data (full resolution for Attachments upload)
    contentType?: string;
    inlineBase64?: string; // Optional compressed JPEG base64 for embedding directly in Zoho ticket description HTML
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