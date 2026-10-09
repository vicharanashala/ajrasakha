import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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

        // A ticket list fetch has already happened (the ticket card loaded) -
        // one empty page.
        mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: [] }) });

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
        expect((await service.getTicketStatuses()).statuses).toEqual({});

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

        // The new ticket shows on the ticket card right away - added to the
        // current ticket snapshot, no Zoho refetch needed.
        const callsBefore = mockFetch.mock.calls.length;
        const created = (await service.getTicketStatuses()).statuses['202216000001888999'];
        expect(mockFetch.mock.calls.length).toBe(callsBefore);
        expect(created).toBeDefined();
        expect(created.ticketNumber).toBe('540');
        expect(created.status).toBe('Open');
        expect(created.severity).toBe('High');
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

    it('rejects dueDate in the past (Issue #16)', async () => {
        (service as any).isConfigured = () => true;

        const result = await service.createTicket({
            subject: '[QA Defect] Past Due Date Test',
            description: 'Testing past due date rejection',
            dueDate: '2020-01-01',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Due Date cannot be earlier than today.');
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

// The ticket card's tickets come straight from Zoho when a request needs
// them - no cron/scheduled sync and no QA sheet/CSV.
describe('ZohoTicketStatusService.getTicketStatuses - direct Zoho fetch', () => {
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

    const page = (data: unknown[]) => ({ ok: true, status: 200, json: async () => ({ data }) });

    it('fetches from Zoho on the first request - nothing has to have run beforehand', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(page([ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'P0 - Critical' })]));

        const result = await service.getTicketStatuses();

        expect(mockFetch).toHaveBeenCalledTimes(2); // token + 1 page
        expect(mockFetch.mock.calls[1]![0]).toContain('/api/v1/tickets?include=team&from=0&limit=100');
        expect(result).toMatchObject({ configured: true, stale: false });
        expect(Object.keys(result.statuses)).toEqual(['1']);
        expect(result.fetchedAt).not.toBeNull();
    });

    it('keeps only Bugs Tracker tickets (by layoutId), excluding other layouts (Annam.ai/Anveshan)', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(
            page([
                ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'P0 - Critical' }),
                ticket({ id: '2', layoutId: OTHER_LAYOUT_ID_1, priority: 'P0 - Critical' }),
                ticket({ id: '3', layoutId: OTHER_LAYOUT_ID_2, priority: 'P0 - Critical' }),
                ticket({ id: '4', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'High' }),
            ]),
        );

        const { statuses } = await service.getTicketStatuses();
        expect(Object.keys(statuses).sort()).toEqual(['1', '4']);
    });

    it('excludes tickets assigned to the Agent Calling Center Team, even though they are Bugs Tracker layout', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(
            page([
                ticket({ id: '20', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'P0 - Critical', teamName: 'Agent Calling Center Team' }),
                ticket({ id: '21', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'High', teamName: 'QA Team' }),
                ticket({ id: '22', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Low', teamName: null }),
            ]),
        );

        const { statuses } = await service.getTicketStatuses();
        expect(Object.keys(statuses).sort()).toEqual(['21', '22']);
    });

    it('maps priority to severity and carries status/team/ticketNumber through for every ticket', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(
            page([
                ticket({ id: '10', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'P0 - Critical', status: 'Open', teamName: 'QA Team', ticketNumber: '900' }),
                ticket({ id: '11', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: null, status: 'Closed' }),
            ]),
        );

        const { statuses } = await service.getTicketStatuses();
        expect(statuses['10']).toMatchObject({ ticketId: '10', status: 'Open', team: 'QA Team', ticketNumber: '900', priority: 'P0 - Critical', severity: 'Critical' });
        expect(statuses['11']).toMatchObject({ ticketId: '11', status: 'Closed', team: null, priority: null, severity: 'No priority' });
        expect(statuses['11']!.url).toContain('11');
    });

    it('pages through the whole ticket list, so "all tickets" is every page', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        const full = (start: number) =>
            Array.from({ length: 100 }, (_, i) => ticket({ id: String(start + i), layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Medium' }));
        mockFetch.mockResolvedValueOnce(page(full(1)));
        mockFetch.mockResolvedValueOnce(page(full(101)));
        mockFetch.mockResolvedValueOnce(page([ticket({ id: '201', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Low' })]));

        const { statuses } = await service.getTicketStatuses();

        expect(mockFetch).toHaveBeenCalledTimes(4); // token + 3 pages
        expect(mockFetch.mock.calls.slice(1).map((c) => String(c[0]).match(/from=(\d+)/)![1])).toEqual(['0', '100', '200']);
        expect(Object.keys(statuses).length).toBe(201);
    });

    it('treats an empty 204 page as the end of the list', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => ticket({ id: String(i + 1), layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID }))));
        mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: async () => { throw new Error('no body'); } });

        const result = await service.getTicketStatuses();
        expect(result.error).toBeUndefined();
        expect(Object.keys(result.statuses).length).toBe(100);
    });

    it('reuses a fetch younger than maxAgeMs, and fetches from Zoho again once it is older', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(page([ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, status: 'Open' })]));
        await service.getTicketStatuses();

        // Within the max age: no new Zoho call.
        await service.getTicketStatuses({ maxAgeMs: 60_000 });
        expect(mockFetch).toHaveBeenCalledTimes(2);

        // Older than the max age: fetched directly again, with the current state.
        mockFetch.mockResolvedValueOnce(page([ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, status: 'Closed' })]));
        const fresh = await service.getTicketStatuses({ maxAgeMs: 0 });
        expect(mockFetch).toHaveBeenCalledTimes(3); // token still valid - just the page
        expect(fresh.statuses['1']!.status).toBe('Closed');
    });

    it('shares one Zoho fetch between concurrent requests', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(page([ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID })]));

        const results = await Promise.all([service.getTicketStatuses(), service.getTicketStatuses(), service.getTicketStatuses()]);

        expect(mockFetch).toHaveBeenCalledTimes(2); // one token refresh + one page, not three of each
        expect(results.every((r) => Object.keys(r.statuses).join() === '1')).toBe(true);
    });

    it('returns the previous fetch marked stale when Zoho fails (never a partial list)', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce(page([ticket({ id: '1', layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID, priority: 'Critical' })]));
        await service.getTicketStatuses();

        // Page 1 succeeds, page 2 fails - the half-fetched list must not be used.
        mockFetch.mockResolvedValueOnce(page(Array.from({ length: 100 }, (_, i) => ticket({ id: String(i + 50), layoutId: ZOHO_BUGS_TRACKER_LAYOUT_ID }))));
        mockFetch.mockResolvedValueOnce({ ok: false, status: 500, text: async () => 'Internal Server Error' });
        const result = await service.getTicketStatuses({ maxAgeMs: 0 });

        expect(result.stale).toBe(true);
        expect(result.error).toContain('500');
        expect(Object.keys(result.statuses)).toEqual(['1']);
    });

    it('returns an empty, non-stale result with an error when the first fetch fails', async () => {
        const mockFetch = vi.fn();
        global.fetch = mockFetch;
        mockTokenRefresh(mockFetch);
        mockFetch.mockResolvedValueOnce({ ok: false, status: 429, text: async () => 'Too Many Requests' });

        const result = await service.getTicketStatuses();
        expect(result).toMatchObject({ statuses: {}, stale: false, fetchedAt: null });
        expect(result.error).toContain('429');
    });

    it('does not call Zoho when it is not configured', async () => {
        const freshService = new ZohoTicketStatusService();
        const mockFetch = vi.fn();
        global.fetch = mockFetch;

        const result = await freshService.getTicketStatuses();

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result).toMatchObject({ configured: false, statuses: {}, stale: false });
    });

    it('needs no cron and no CSV: the service has no scheduled sync method and reads no files', () => {
        expect((service as any).syncAllBugsTrackerTickets).toBeUndefined();
        expect((service as any).getCachedStatuses).toBeUndefined();
        const dir = path.dirname(fileURLToPath(import.meta.url));
        const source = fs.readFileSync(path.join(dir, '../services/ZohoTicketStatusService.ts'), 'utf8');
        expect(source).not.toMatch(/from 'fs'|from 'csv-parser'|TESTERS_DASHBOARD_CSV_PATH|updated\.csv/);
    });
});
