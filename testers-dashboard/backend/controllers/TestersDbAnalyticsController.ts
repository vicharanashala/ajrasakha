import 'reflect-metadata';
import { JsonController, Get, Authorized, QueryParams } from 'routing-controllers';
import { inject } from 'inversify';
import { OpenAPI } from 'routing-controllers-openapi';
import { DASHBOARD_TYPES } from '../types.js';
import type { ITestersDbAnalyticsService } from '../interfaces/ITestersDbAnalyticsService.js';
import { GetTestersDbAnalyticsQuery } from '../validators/TestersDbAnalyticsValidators.js';

@OpenAPI({
    tags: ['dashboard'],
    description: 'Testers Dashboard - Database Logs Analytics (tester_test_cases)',
})
@JsonController('/dashboard/testers/db')
export class TestersDbAnalyticsController {
    constructor(
        @inject(DASHBOARD_TYPES.TestersDbAnalyticsService)
        private readonly testersDbAnalyticsService: ITestersDbAnalyticsService,
    ) { }

    @OpenAPI({
        summary: 'Get stored tester entries for Database Logs Analytics',
        description:
            'Returns tester_test_cases entries matching the DB Analytics filters (filtered in MongoDB), in their ' +
            'stored TesterLogEntry shape limited to the fields analytics reads, plus the DB filter options with ' +
            'per-option counts (zero-count options included).',
    })
    @Authorized(['admin'])
    @Get('/entries')
    async getEntries(@QueryParams() query: GetTestersDbAnalyticsQuery) {
        return this.testersDbAnalyticsService.getEntries(query);
    }

    @OpenAPI({
        summary: 'Get the DB-native Database Logs Analytics summary',
        description:
            'KPIs, critical failure categories, release health, diagnostics, the daily score trend and the ' +
            '"vs previous period" figures, calculated directly from stored tester_test_cases entries (filtered in ' +
            'MongoDB) - not through the Google Sheet calculations - plus the DB filter options with counts.',
    })
    @Authorized(['admin'])
    @Get('/summary')
    async getSummary(@QueryParams() query: GetTestersDbAnalyticsQuery) {
        return this.testersDbAnalyticsService.getSummary(query);
    }
}
