export interface ZohoTicketStatus {
    ticketId: string;
    status: string; // "Open", "Closed", "On Hold", etc.
    // The Zoho ticket's Team field (owning team's name), resolved via the
    // `?include=team` param on the ticket fetch - not the same as the
    // ticket's individual assignee. Null when Zoho has no team set on the
    // ticket (e.g. an older ticket predating team routing).
    team: string | null;
    // Zoho's short human-facing ticket number (e.g. "539"), distinct from
    // the long internal `ticketId` used for lookups/URLs. Null when Zoho
    // hasn't returned one yet (e.g. not synced).
    ticketNumber: string | null;
    lastCheckedAt: string;
}

export interface IZohoTicketStatusService {
    /**
     * Refreshes cached status for the given ticket IDs (pulled from the
     * Defect ID / Bug Ref links already in the sheet), via the Zoho Desk API.
     */
    syncTicketStatuses(ticketIds: string[]): Promise<void>;

    /**
     * Returns whatever statuses are currently cached (does not hit Zoho).
     */
    getCachedStatuses(): Record<string, ZohoTicketStatus>;
}