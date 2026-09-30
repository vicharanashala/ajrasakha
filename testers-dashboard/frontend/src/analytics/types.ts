export type TestersDashboardRecord = Record<string, string>;

export interface ZohoTicketStatus {
    ticketId: string;
    status: string;
    team: string | null;
    ticketNumber: string | null;
    priority: string | null;
    severity: string;
    url: string;
    lastCheckedAt: string;
}
