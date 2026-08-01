import 'reflect-metadata';
import { JsonController, Get, Authorized } from 'routing-controllers';
import { inject } from 'inversify';
import { OpenAPI } from 'routing-controllers-openapi';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { ITestersDashboardService } from '../interfaces/ITestersDashboardService.js';

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
}