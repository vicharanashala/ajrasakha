import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import { useExpressServer, useContainer } from 'routing-controllers';
import { Container } from 'inversify';
// Same harness as TestersDashboardController.test.ts - needs backend/'s
// compiled output (`pnpm build` in backend/).
import { InversifyAdapter } from '../../../backend/build/inversify-adapter.js';
import { HttpErrorHandler } from '../../../backend/build/shared/index.js';
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { DASHBOARD_TYPES } from '../types.js';
import { TestersDbAnalyticsController } from '../controllers/TestersDbAnalyticsController.js';

// Mocked service - verifies routing, query-param wiring, validation, and the
// admin-only guard. Filtering itself is TestersDbAnalyticsService.test.ts.
const mockResponse = {
    success: true,
    totalRecords: 2,
    matchedRecords: 1,
    entries: [{ _id: 'e1', testId: 'TL-1', channelTested: 'WebApp' }],
    filterOptions: { fields: {}, typeTree: { dynamic: [], static: [], dynamicTotal: 0, staticTotal: 0 } },
    lastSyncedAt: '2026-09-26T00:00:00.000Z',
};
const mockService = { getEntries: vi.fn(), getSummary: vi.fn() };
const mockSummary = { success: true, calculation: 'db-native', totalRecords: 2, matchedRecords: 2, kpis: { N: 2, passRate: 50 } };

describe('TestersDbAnalyticsController', () => {
    let app: any;

    beforeAll(() => {
        const container = new Container();
        container.bind(TestersDbAnalyticsController).toSelf().inSingletonScope();
        container.bind(DASHBOARD_TYPES.TestersDbAnalyticsService).toConstantValue(mockService);
        container.bind(HttpErrorHandler).toSelf().inSingletonScope();
        useContainer(new InversifyAdapter(container));

        app = useExpressServer(Express(), {
            controllers: [TestersDbAnalyticsController],
            middlewares: [HttpErrorHandler],
            defaultErrorHandler: false,
            validation: true,
            authorizationChecker: async (action, roles) => {
                const role = action.request.headers['x-test-role'] || 'admin';
                return roles.length === 0 || roles.includes(role);
            },
            currentUserChecker: async (action) => ({
                _id: '664f000000000000000000001',
                role: action.request.headers['x-test-role'] || 'admin',
            }),
        });
    });

    beforeEach(() => {
        mockService.getEntries.mockReset();
        mockService.getEntries.mockResolvedValue(mockResponse);
        mockService.getSummary.mockReset();
        mockService.getSummary.mockResolvedValue(mockSummary);
    });

    it('GET /summary returns the DB-native summary to admins only, passing the DB filters through', async () => {
        const res = await request(app).get('/dashboard/testers/db/summary').query({ dateRange: '7days', tester: 'u1', channel: 'WebApp' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockSummary);
        expect(mockService.getSummary).toHaveBeenCalledWith(expect.objectContaining({ dateRange: '7days', tester: 'u1', channel: 'WebApp' }));
        expect((await request(app).get('/dashboard/testers/db/summary').set('x-test-role', 'tester')).status).toBe(403);
        expect((await request(app).get('/dashboard/testers/db/summary').query({ dateRange: 'bad' })).status).toBe(400);
    });

    it('admin gets 200 with the raw entries response', async () => {
        const res = await request(app).get('/dashboard/testers/db/entries');
        expect(res.status).toBe(200);
        expect(res.body).toEqual(mockResponse);
    });

    it('non-admin gets 403', async () => {
        const res = await request(app).get('/dashboard/testers/db/entries').set('x-test-role', 'tester');
        expect(res.status).toBe(403);
        expect(mockService.getEntries).not.toHaveBeenCalled();
    });

    it('passes every DB filter through to the service', async () => {
        const query = {
            dateRange: 'custom', customStart: '2026-09-01', customEnd: '2026-09-30', category: 'Weed Management',
            build: '0.1', channel: 'WebApp', language: 'English', tester: '64b7f0c2a1b2c3d4e5f60718', status: 'Pass',
            severity: 'NA', typeBranch: 'Dynamic', dynamicSubTypes: 'Weather Dynamic,Static Dynamic', staticSubTypes: 'GDB',
            type: 'GDB',
        };
        const res = await request(app).get('/dashboard/testers/db/entries').query(query);
        expect(res.status).toBe(200);
        expect(mockService.getEntries).toHaveBeenCalledWith(expect.objectContaining(query));
    });

    it('rejects an invalid dateRange / typeBranch', async () => {
        expect((await request(app).get('/dashboard/testers/db/entries').query({ dateRange: 'yesterday' })).status).toBe(400);
        expect((await request(app).get('/dashboard/testers/db/entries').query({ typeBranch: 'Other' })).status).toBe(400);
    });

    it('has no source or excludeFailures param in its query contract', async () => {
        const { GetTestersDbAnalyticsQuery } = await import('../validators/TestersDbAnalyticsValidators.js');
        const { getMetadataStorage } = await import('class-validator');
        const props = new Set(
            getMetadataStorage()
                .getTargetValidationMetadatas(GetTestersDbAnalyticsQuery, '', true, false)
                .map((m) => m.propertyName),
        );
        expect(props.has('source')).toBe(false);
        expect(props.has('excludeFailures')).toBe(false);
        expect([...props].sort()).toEqual(
            ['build', 'category', 'channel', 'customEnd', 'customStart', 'dateRange', 'dynamicSubTypes', 'language',
             'severity', 'staticSubTypes', 'status', 'tester', 'type', 'typeBranch'].sort(),
        );
    });
});
