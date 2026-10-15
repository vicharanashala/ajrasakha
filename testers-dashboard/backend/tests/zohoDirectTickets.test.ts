import 'reflect-metadata';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import request from 'supertest';
import Express from 'express';
import { useExpressServer, useContainer } from 'routing-controllers';
import { Container } from 'inversify';
import { InversifyAdapter } from '../../../backend/build/inversify-adapter.js';
import { HttpErrorHandler } from '../../../backend/build/shared/index.js';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { DASHBOARD_TYPES } from '../types.js';
import { ZohoTicketStatusController } from '../controllers/ZohoTicketStatusController.js';
import { TestersDbAnalyticsService } from '../services/TestersDbAnalyticsService.js';
import { zohoTicketLists } from '../dbAnalytics/diagnostics.js';
import { mapZohoPriorityToSeverity } from '../services/ZohoTicketStatusService.js';
import type { ZohoTicketStatus, ZohoTicketsSnapshot } from '../interfaces/IZohoTicketStatusService.js';

// Zoho ticket values reach the dashboard directly from Zoho on each request
// (Dashboard request -> ZohoTicketStatusService -> Zoho API -> response),
// with no cron and no QA sheet/CSV in between.

const dir = path.dirname(fileURLToPath(import.meta.url));

function status(id: string, priority: string | null, extra: Partial<ZohoTicketStatus> = {}): ZohoTicketStatus {
    return {
        ticketId: id,
        status: 'Open',
        team: null,
        ticketNumber: id,
        priority,
        severity: mapZohoPriorityToSeverity(priority),
        url: `https://desk.zoho.in/agent/annamai/annam-ai/tickets/details/${id}`,
        lastCheckedAt: '2026-10-06T00:00:00.000Z',
        ...extra,
    };
}

const snapshot = (statuses: Record<string, ZohoTicketStatus>): ZohoTicketsSnapshot => ({
    configured: true,
    statuses,
    fetchedAt: new Date().toISOString(),
    stale: false,
});

// An empty tester_test_cases collection - only the Zoho side matters here.
const emptyDb = {
    getCollection: async () => ({
        aggregate: () => ({ toArray: async () => [{ total: [] }] }),
        find: () => ({ sort: () => ({ toArray: async () => [] }), toArray: async () => [] }),
    }),
};

describe('Zoho ticket categories on the dashboard', () => {
    it('puts Critical (incl. P0) and High tickets in the Critical Defect Tickets view, and every ticket in All Tickets', () => {
        const statuses = Object.fromEntries(
            [
                status('1', 'P0 - Critical'),
                status('2', 'Critical'),
                status('3', 'P1 - High'),
                status('4', 'High'),
                status('5', 'P2 - Medium'),
                status('6', 'Low'),
                status('7', null),
            ].map((s) => [s.ticketId, s]),
        );
        const { openTickets, allTickets } = zohoTicketLists(statuses);
        expect(openTickets.map((t) => [t.id, t.severity])).toEqual([['1', 'Critical'], ['3', 'High'], ['4', 'High']]);
        expect(allTickets.map((t) => t.id)).toEqual(['1', '2', '3', '4', '5', '6', '7']);
        expect(allTickets.find((t) => t.id === '7')?.severity).toBe('No priority');
    });
});

describe('DB Analytics summary gets current Zoho tickets on every request (no cron)', () => {
    it('fetches tickets through ZohoTicketStatusService for each summary, so a change in Zoho shows on the next request', async () => {
        const getTicketStatuses = vi
            .fn()
            .mockResolvedValueOnce(snapshot({ '1': status('1', 'P0 - Critical') }))
            .mockResolvedValueOnce(snapshot({ '1': status('1', 'P0 - Critical', { status: 'Closed' }), '2': status('2', 'High') }));
        const service = new TestersDbAnalyticsService(emptyDb as any, { getTicketStatuses } as any);

        const first = await service.getSummary({});
        expect(first.success).toBe(true);
        expect(first.diagnostics.allTickets.map((t) => t.id)).toEqual(['1']);

        const second = await service.getSummary({});
        expect(getTicketStatuses).toHaveBeenCalledTimes(2);
        expect(second.diagnostics.openTickets.map((t) => t.id).sort()).toEqual(['1', '2']);
        expect(second.diagnostics.allTickets).toHaveLength(2);
    });

    it('still returns the summary (with no tickets) when Zoho is unreachable', async () => {
        const getTicketStatuses = vi.fn().mockResolvedValue({ configured: true, statuses: {}, fetchedAt: null, stale: false, error: 'Zoho down' });
        const result = await new TestersDbAnalyticsService(emptyDb as any, { getTicketStatuses } as any).getSummary({});
        expect(result.success).toBe(true);
        expect(result.diagnostics.allTickets).toEqual([]);
    });
});

describe('GET /dashboard/testers/zoho-status', () => {
    let app: any;
    const getTicketStatuses = vi.fn();

    beforeAll(() => {
        const container = new Container();
        container.bind(ZohoTicketStatusController).toSelf().inSingletonScope();
        container.bind(DASHBOARD_TYPES.ZohoTicketStatusService).toConstantValue({ getTicketStatuses, getTeams: vi.fn(), createTicket: vi.fn() });
        container.bind(HttpErrorHandler).toSelf().inSingletonScope();
        useContainer(new InversifyAdapter(container));
        app = useExpressServer(Express(), {
            controllers: [ZohoTicketStatusController],
            middlewares: [HttpErrorHandler],
            defaultErrorHandler: false,
            authorizationChecker: async () => true,
            currentUserChecker: async () => ({ _id: 'u1', role: 'admin' }),
        });
    });

    it('returns the statuses from a direct Zoho fetch, with when they were fetched', async () => {
        getTicketStatuses.mockResolvedValueOnce({ ...snapshot({ '9': status('9', 'High', { team: 'QA Team', status: 'On Hold' }) }), fetchedAt: '2026-10-06T10:00:00.000Z' });
        const res = await request(app).get('/dashboard/testers/zoho-status');
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ success: true, stale: false, configured: true, fetchedAt: '2026-10-06T10:00:00.000Z' });
        expect(res.body.statuses['9']).toMatchObject({ team: 'QA Team', status: 'On Hold', severity: 'High' });
        expect(getTicketStatuses).toHaveBeenCalledTimes(1);
    });

    it('reports a stale result and its error when Zoho could not be reached', async () => {
        getTicketStatuses.mockResolvedValueOnce({ ...snapshot({ '9': status('9', 'High') }), stale: true, error: 'Zoho down' });
        const res = await request(app).get('/dashboard/testers/zoho-status');
        expect(res.body).toMatchObject({ success: true, stale: true, error: 'Zoho down' });
        expect(Object.keys(res.body.statuses)).toEqual(['9']);
    });
});

describe('Zoho cron removal', () => {
    const jobsDir = path.join(dir, '../../../backend/src/bootstrap/jobs');
    const jobsIndex = fs.readFileSync(path.join(jobsDir, 'index.ts'), 'utf8');

    it('no longer registers a Zoho ticket cron, and its files are gone', () => {
        expect(jobsIndex).not.toMatch(/zoho/i);
        expect(fs.existsSync(path.join(jobsDir, 'zohoTicketStatusSyncCron.ts'))).toBe(false);
        expect(fs.existsSync(path.join(dir, '../jobs/zohoTicketStatusSyncCron.ts'))).toBe(false);
    });

    it('keeps every other scheduled job registered', () => {
        const registered = [...jobsIndex.matchAll(/^import '\.\/([^']+)\.js'/gm)].map((m) => m[1]);
        expect(registered).toEqual([
            'questionStatus',
            'notificationDelete',
            'backupDB',
            'dailyReport',
            'reAllocateCron',
            'timeBoundReAllocateCron',
            'moderatorQueueCron',
            'agentStatusCleanupJob',
            'testersDashboardSyncCron',
            'gateKeeperAuditorQueueCron',
            'feedbackAllocationCron',
            'paeValidationQueueCron',
        ]);
        for (const job of registered) expect(fs.existsSync(path.join(jobsDir, `${job}.ts`))).toBe(true);
    });
});
