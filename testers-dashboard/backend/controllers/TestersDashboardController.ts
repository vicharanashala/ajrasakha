import 'reflect-metadata';
import { JsonController, Get, Authorized, QueryParams, QueryParam, Res } from 'routing-controllers';
import { inject } from 'inversify';
import { OpenAPI } from 'routing-controllers-openapi';
import { DASHBOARD_TYPES } from '../types.js';
import { ITestersDashboardService } from '../interfaces/ITestersDashboardService.js';
import { GetTestersDashboardQuery } from '../validators/TestersDashboardValidators.js';

@OpenAPI({
    tags: ['dashboard'],
    description: 'Testers Dashboard (QA tracking) operations',
})
@JsonController('/dashboard/testers')
export class TestersDashboardController {
    constructor(
        @inject(DASHBOARD_TYPES.TestersDashboardService)
        private readonly testersDashboardService: ITestersDashboardService,
    ) { }

    @OpenAPI({
        summary: 'Get testers dashboard QA tracking records',
        description:
            'Returns all parsed QA tracking records used to compute the Trust Score and Farmer Experience Score.',
    })
    @Authorized(['admin'])
    @Get('/data')
    async getData(@QueryParam('source') source?: 'sheet' | 'db') {
        return this.testersDashboardService.getData(source);
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

    @OpenAPI({
        summary: 'Get list of configured Google Sheet sources',
        description: 'Returns metadata for each configured Google Sheet source (index, label, tab).',
    })
    @Authorized(['admin'])
    @Get('/sheets/sources')
    async getSheetSources() {
        const sources = this.testersDashboardService.getSheetSources();
        return {
            success: true,
            sources,
        };
    }

    @OpenAPI({
        summary: 'Zero-buffer stream Google Sheet raw data',
        description: 'Pipes the Google Sheets API response directly to client socket without buffering or parsing on server.',
    })
    @Authorized(['admin'])
    @Get('/sheets/stream')
    async streamSheet(@QueryParam('index') index: number, @Res() res: any) {
        await this.testersDashboardService.streamSheet(Number(index) || 0, res);
        return res;
    }
}