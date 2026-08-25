import 'reflect-metadata';
import { JsonController, Get, Authorized, QueryParams } from 'routing-controllers';
import { inject } from 'inversify';
import { OpenAPI } from 'routing-controllers-openapi';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { ITestersDashboardService } from '../interfaces/ITestersDashboardService.js';
import { GetTestersDashboardQuery } from '../validators/TestersDashboardValidators.js';

@OpenAPI({
    tags: ['dashboard'],
    description: 'Testers Dashboard (QA tracking) operations',
})
@JsonController('/dashboard/testers')
export class TestersDashboardController {
    constructor(
        @inject(CORE_TYPES.TestersDashboardService)
        private readonly testersDashboardService: ITestersDashboardService,
    ) { }

    @OpenAPI({
        summary: 'Get testers dashboard QA tracking records',
        description:
            'Returns all parsed QA tracking records used to compute the Trust Score and Farmer Experience Score.',
    })
    @Authorized(['admin'])
    @Get('/data')
    async getData() {
        return this.testersDashboardService.getData();
    }

    @OpenAPI({
        summary: 'Get server-side-computed testers dashboard summary',
        description:
            'Applies the given filters server-side and returns the resulting KPIs (Trust Score, Farmer ' +
            'Experience Score, Critical Failures, Release Health, etc.), diagnostics (Biggest Bottleneck, ' +
            'Weakest Modules, Open Critical Defects), the daily trend chart data (Trust/Experience scores, ' +
            'average response latency, average review TAT), the "vs previous period" comparison, and ' +
            'filter-dropdown options built from the full dataset.',
    })
    @Authorized(['admin'])
    @Get('/summary')
    async getSummary(@QueryParams() query: GetTestersDashboardQuery) {
        return this.testersDashboardService.getSummary(query);
    }
}