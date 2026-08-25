import 'reflect-metadata';
import { JsonController, Get, Authorized } from 'routing-controllers';
import { inject } from 'inversify';
import { OpenAPI } from 'routing-controllers-openapi';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { IZohoTicketStatusService } from '../interfaces/IZohoTicketStatusService.js';

@OpenAPI({
    tags: ['dashboard'],
    description: 'Zoho Desk ticket status operations for the Testers Dashboard',
})
@JsonController('/dashboard/testers')
export class ZohoTicketStatusController {
    constructor(
        @inject(CORE_TYPES.ZohoTicketStatusService)
        private readonly zohoTicketStatusService: IZohoTicketStatusService,
    ) { }

    @OpenAPI({
        summary: 'Get cached Zoho ticket statuses',
        description:
            'Returns the most recently synced status (Open/Closed/etc.) for each Zoho ticket linked from the QA tracking sheet.',
    })
    @Authorized(['admin'])
    @Get('/zoho-status')
    async getZohoStatuses() {
        return {
            success: true,
            statuses: this.zohoTicketStatusService.getCachedStatuses(),
        };
    }
}