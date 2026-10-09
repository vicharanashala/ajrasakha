import 'reflect-metadata';
import { JsonController, Get, Post, Body, Authorized } from 'routing-controllers';
import { inject } from 'inversify';
import { OpenAPI } from 'routing-controllers-openapi';
import { DASHBOARD_TYPES } from '../types.js';
import { IZohoTicketStatusService } from '../interfaces/IZohoTicketStatusService.js';
import { CreateZohoTicketDto } from '../validators/TesterLogValidators.js';

@OpenAPI({
    tags: ['dashboard'],
    description: 'Zoho Desk ticket status and creation operations for the Testers Dashboard',
})
@JsonController('/dashboard/testers')
export class ZohoTicketStatusController {
    constructor(
        @inject(DASHBOARD_TYPES.ZohoTicketStatusService)
        private readonly zohoTicketStatusService: IZohoTicketStatusService,
    ) { }

    @OpenAPI({
        summary: 'Get cached Zoho ticket statuses',
        description:
            'Returns the most recently synced status (Open/Closed/etc.) for each Zoho ticket linked from the QA tracking sheet.',
    })
    @Authorized(['admin', 'tester'])
    @Get('/zoho-status')
    async getZohoStatuses() {
        return {
            success: true,
            statuses: this.zohoTicketStatusService.getCachedStatuses(),
        };
    }

    @OpenAPI({
        summary: 'Get Zoho Desk teams',
        description:
            'Returns the list of teams in Zoho Desk for ticket assignment.',
    })
    @Authorized(['admin', 'tester'])
    @Get('/zoho-teams')
    async getZohoTeams() {
        const teams = await this.zohoTicketStatusService.getTeams();
        return {
            success: true,
            teams,
        };
    }

    @OpenAPI({
        summary: 'Create a Zoho Desk ticket',
        description:
            'Creates a ticket in Zoho Desk from tester defect reports and returns the created ticket details and web link.',
    })
    @Authorized(['admin', 'tester'])
    @Post('/zoho-ticket')
    async createTicket(@Body({ options: { limit: '50mb' } }) body: CreateZohoTicketDto) {
        return await this.zohoTicketStatusService.createTicket(body);
    }
}