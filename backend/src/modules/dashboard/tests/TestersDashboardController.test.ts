import 'reflect-metadata';
import request from 'supertest';
import Express from 'express';
import { useExpressServer, useContainer } from 'routing-controllers';
import { Container } from 'inversify';
import { InversifyAdapter } from '#root/inversify-adapter.js';
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { HttpErrorHandler } from '#shared/index.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { TestersDashboardController } from '../controllers/TestersDashboardController.js';

// Mocked service - this file verifies routing/query-param wiring and the
// admin-only guard, NOT KPI correctness (that's TestersDashboardService.test.ts,
// against the real CSV).
const mockSummaryResponse = {
    success: true,
    totalRecords: 11193,
    kpis: { N: 3127, trustScore: 55 },
    previousPeriodStats: null,
    filterOptions: { type: ['GDB', 'Dynamic'] },
    lastSyncedAt: '2026-08-11T00:00:00.000Z',
};

const mockTestersDashboardService = {
    getData: vi.fn().mockResolvedValue({ success: true, totalRecords: 1, records: [], lastSyncedAt: null }),
    getSummary: vi.fn().mockResolvedValue(mockSummaryResponse),
    syncFromSheet: vi.fn(),
};

describe('TestersDashboardController', () => {
    let app: any;

    beforeAll(() => {
        const container = new Container();
        container.bind(TestersDashboardController).toSelf().inSingletonScope();
        container.bind(CORE_TYPES.TestersDashboardService).toConstantValue(mockTestersDashboardService);
        container.bind(HttpErrorHandler).toSelf().inSingletonScope();

        useContainer(new InversifyAdapter(container));

        app = useExpressServer(Express(), {
            controllers: [TestersDashboardController],
            middlewares: [HttpErrorHandler],
            defaultErrorHandler: false,
            validation: true,
            // Respects the roles array passed to @Authorized(['admin']) -
            // an empty array (bare @Authorized()) means "any authenticated
            // user", a non-empty array means "only these roles."
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

    describe('GET /dashboard/testers/summary', () => {
        it('admin gets 200 with the service\'s response', async () => {
            const res = await request(app).get('/dashboard/testers/summary');
            expect(res.status).toBe(200);
            expect(res.body).toEqual(mockSummaryResponse);
        });

        it('non-admin gets 403', async () => {
            const res = await request(app).get('/dashboard/testers/summary').set('x-test-role', 'expert');
            expect(res.status).toBe(403);
        });

        it('passes query params through to service.getSummary() as GetTestersDashboardQuery', async () => {
            await request(app).get('/dashboard/testers/summary').query({
                type: 'GDB',
                status: 'Pass',
                dateRange: '7days',
                excludeFailures: 'true',
            });
            expect(mockTestersDashboardService.getSummary).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'GDB',
                    status: 'Pass',
                    dateRange: '7days',
                    // Stays a string, not coerced to boolean - this app's
                    // routing-controllers setup has no implicit type
                    // conversion (see TestersDashboardValidators.ts).
                    excludeFailures: 'true',
                }),
            );
        });

        it('rejects an invalid dateRange value via @IsIn, not a JSON-parse crash', async () => {
            const res = await request(app).get('/dashboard/testers/summary').query({ dateRange: 'not-a-real-range' });
            expect(res.status).toBe(400);
            // Specifically checks the rejection is an @IsIn validation error
            // (mentions the property/constraint), not routing-controllers
            // failing to JSON.parse() the raw query string - which would
            // also 400, but for the wrong reason, and would 400 on every
            // dateRange value including valid ones.
            expect(JSON.stringify(res.body)).not.toMatch(/cannot be parsed into JSON/i);
        });

        it('accepts every valid dateRange value without a JSON-parse crash', async () => {
            for (const dateRange of ['all', 'today', '7days', '30days', 'custom']) {
                const res = await request(app).get('/dashboard/testers/summary').query({ dateRange });
                expect(res.status).toBe(200);
            }
        });
    });

    describe('GET /dashboard/testers/data (existing route, unaffected)', () => {
        it('still returns 200', async () => {
            const res = await request(app).get('/dashboard/testers/data');
            expect(res.status).toBe(200);
        });
    });
});
