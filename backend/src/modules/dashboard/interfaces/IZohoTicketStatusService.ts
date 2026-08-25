export interface ZohoTicketStatus {
    ticketId: string;
    status: string; // "Open", "Closed", "On Hold", etc.
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