import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZohoTicketStatusService, mapZohoPriorityToSeverity, ZOHO_BUGS_TRACKER_LAYOUT_ID } from '../services/ZohoTicketStatusService.js';

const OTHER_LAYOUT_ID_1 = 'other-layout-annam-ai';
const OTHER_LAYOUT_ID_2 = 'other-layout-anveshan';

function mockTokenRefresh(mockFetch: ReturnType<typeof vi.fn>) {
    mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ access_token: 'mock-access-token', expires_in: 3600 }),
    });
}

describe('ZohoTicketStatusService.createTicket', () => {
    let service: ZohoTicketStatusService;
    const originalFetch = global.fetch;

    beforeEach(() => {
        service = new ZohoTicketStatusService();
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('returns error when Zoho is not configured with environment variables', async () => {
        // Without env vars configured
        const result = await service.createTicket({
            subject: 'Test Bug',
            description: 'Test details',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('not configured or authentication failed');
    });

    it('successfully creates ticket and returns URL and ticket details', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;

        // Mock token refresh
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'mock-access-token', expires_in: 3600 }),
        });

        // Mock ticket creation API call
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                id: '202216000001888999',
                ticketNumber: '540',
                status: 'Open',
                team: { name: 'QA Team' },
            }),
        });

        // Temporarily stub isConfigured by checking token fetch
        (service as any).isConfigured = () => true;

        const result = await service.createTicket({
            subject: '[QA Defect] Incorrect Mandi Price',
            description: 'Query returned price from 2024 instead of 2026.',
            priority: 'High',
            testerName: 'John Tester',
            email: 'john@example.com',
        });

        expect(result.success).toBe(true);
        expect(result.ticket?.ticketId).toBe('202216000001888999');
        expect(result.ticket?.ticketNumber).toBe('540');
        expect(result.ticket?.status).toBe('Open');
        expect(result.ticket?.url).toContain('202216000001888999');

        // Check cached status
        const cached = service.getCachedStatuses()['202216000001888999'];
        expect(cached).toBeDefined();
        expect(cached.ticketNumber).toBe('540');
        expect(cached.status).toBe('Open');
    });

    it('gracefully handles scope mismatch / permission error and sets requiresScopeUpgrade', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;

        // Mock token refresh
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ access_token: 'mock-access-token', expires_in: 3600 }),
        });

        // Mock 403 scope error from Zoho
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            text: async () => JSON.stringify({
                errorCode: 'OAUTH_SCOPE_MISMATCH',
                message: 'You are not authorized to perform this operation. Required scope: Desk.tickets.CREATE',
            }),
        });

        (service as any).isConfigured = () => true;

        const result = await service.createTicket({
            subject: '[QA Defect] Scope Test',
            description: 'Testing scope mismatch handling',
        });

        expect(result.success).toBe(false);
        expect(result.requiresScopeUpgrade).toBe(true);
        expect(result.error).toContain('Desk.tickets.CREATE');
    });
});

// Zoho's own `priority` field -> the ticket card's display severity. Both
// naming styles real Zoho tickets are seen using ("P1 - High" from tickets
// this app creates itself, plain "High" from tickets created directly in
// Zoho's UI) must map to the same severity - this is the ONE mapping used
// for every ticket the card shows, so a drift here would silently
// mis-bucket tickets between the Critical Defect Tickets and All Tickets
// views.
describe('mapZohoPriorityToSeverity', () => {
    it('maps every documented Zoho priority value to its display severity', () => {
        expect(mapZohoPriorityToSeverity('P0 - Critical')).toBe('Critical');
        expect(mapZohoPriorityToSeverity('P1 - High')).toBe('High');
        expect(mapZohoPriorityToSeverity('High')).toBe('High');
        expect(mapZohoPriorityToSeverity('P2 - Medium')).toBe('Medium');
        expect(mapZohoPriorityToSeverity('Medium')).toBe('Medium');
        expect(mapZohoPriorityToSeverity('P3 - Low')).toBe('Low');
        expect(mapZohoPriorityToSeverity('Low')).toBe('Low');
    });

    it('maps a blank, null, undefined, or unrecognized priority to "No priority", not an exception', () => {
        expect(mapZohoPriorityToSeverity(null)).toBe('No priority');
        expect(mapZohoPriorityToSeverity(undefined)).toBe('No priority');
        expect(mapZohoPriorityToSeverity('')).toBe('No priority');
        expect(mapZohoPriorityToSeverity('   ')).toBe('No priority');
        expect(mapZohoPriorityToSeverity('Some Unrecognized Value')).toBe('No priority');
    });

    it('is case-insensitive', () => {
        expect(mapZohoPriorityToSeverity('p0 - critical')).toBe('Critical');
        expect(mapZohoPriorityToSeverity('HIGH')).toBe('High');
    });
});

describe('ZohoTicketStatusService.syncAllBugsTrackerTickets', () => {
    let service: ZohoTicketStatusService;
    const originalFetch = global.fetch;

    beforeEach(() => {
        service = new ZohoTicketStatusService();
        (service as any).isConfigured = () => true;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    function ticket(overrides: {
        id: string;
        layoutId: string;
        priority?: string | null;
        status?: string;
        ticketNumber?: string;
        teamName?: string | null;
    }) {
        return {
            id: overrides.id,
            status: overrides.status ?? 'Open',
            priority: overrides.priority ?? null,
            ticketNumber: overrides.ticketNumber ?? String(Number(overrides.id) + 100),
            layoutId: overrides.layoutId,
            team: overrides.teamName ? { id: 'team-1', name: overrides.teamName } : null,
        };
    }

    it('keeps only Bugs Tracker tickets (by layoutId), excluding other layouts (Annam.ai/Anveshan)', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'P0 - Critical' }),
                    ticket({ id: '2', layoutId: OTHER_LAYOUT_ID_1, priority: 'P0 - Critical' }),
                    ticket({ id: '3', layoutId: OTHER_LAYOUT_ID_2, priority: 'P0 - Critical' }),
                    ticket({ id: '4', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'High' }),
                ],
            }),
        });

        await service.syncAllBugsTrackerTickets();

        const cached = service.getCachedStatuses();
        expect(Object.keys(cached).sort()).toEqual(['1', '4']);
        expect(cached['2']).toBeUndefined();
        expect(cached['3']).toBeUndefined();
    });

    it('maps priority to severity and carries status/team/ticketNumber through for every cached ticket', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    ticket({ id: '10', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'P0 - Critical', status: 'Open', teamName: 'QA Team', ticketNumber: '900' }),
                    ticket({ id: '11', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: null, status: 'Closed' }),
                ],
            }),
        });

        await service.syncAllBugsTrackerTickets();

        const cached = service.getCachedStatuses();
        expect(cached['10']).toMatchObject({
            ticketId: '10',
            status: 'Open',
            team: 'QA Team',
            ticketNumber: '900',
            priority: 'P0 - Critical',
            severity: 'Critical',
        });
        expect(cached['11']).toMatchObject({
            ticketId: '11',
            status: 'Closed',
            team: null,
            priority: null,
            severity: 'No priority',
        });
        expect(cached['11']!.url).toContain('11');
    });

    it('pages through the ticket list until a short page signals the end', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);

        const firstPage = Array.from({ length: 100 }, (_, i) =>
            ticket({ id: String(i + 1), layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Medium' }),
        );
        const secondPage = [ticket({ id: '101', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Low' })];

        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: firstPage }) });
        mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ data: secondPage }) });

        await service.syncAllBugsTrackerTickets();

        expect(mockFetch).toHaveBeenCalledTimes(3); // token + 2 pages
        expect(mockFetch.mock.calls[1]![0]).toContain('from=0');
        expect(mockFetch.mock.calls[2]![0]).toContain('from=100');
        expect(Object.keys(service.getCachedStatuses()).length).toBe(101);
    });

    it('leaves the previous cache untouched when a page fetch fails mid-sync (no partial overwrite)', async () => {
        // First, a successful sync populates the cache.
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ data: [ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Critical' })] }),
        });
        await service.syncAllBugsTrackerTickets();
        expect(Object.keys(service.getCachedStatuses())).toEqual(['1']);

        // Second sync: token refresh succeeds (still cached from before, so
        // no new token call), but the ticket page fails.
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 500,
            text: async () => 'Internal Server Error',
        });
        await service.syncAllBugsTrackerTickets();

        // The failed sync must not have wiped out ticket "1".
        expect(Object.keys(service.getCachedStatuses())).toEqual(['1']);
    });

    it('excludes tickets assigned to the Agent Calling Center Team, even though they are Bugs Tracker layout', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                data: [
                    ticket({ id: '20', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'P0 - Critical', teamName: 'Agent Calling Center Team' }),
                    ticket({ id: '21', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'High', teamName: 'QA Team' }),
                    ticket({ id: '22', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Low', teamName: null }),
                ],
            }),
        });

        await service.syncAllBugsTrackerTickets();

        const cached = service.getCachedStatuses();
        expect(Object.keys(cached).sort()).toEqual(['21', '22']);
        expect(cached['20']).toBeUndefined();
    });

    it('does nothing when Zoho is not configured', async () => {
        const freshService = new ZohoTicketStatusService();
        const mockFetch = vi.fn();
        global.fetch = mockFetch;

        await freshService.syncAllBugsTrackerTickets();

        expect(mockFetch).not.toHaveBeenCalled();
        expect(freshService.getCachedStatuses()).toEqual({});
    });
});
