import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ZohoTicketStatusService } from '../services/ZohoTicketStatusService.js';

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
