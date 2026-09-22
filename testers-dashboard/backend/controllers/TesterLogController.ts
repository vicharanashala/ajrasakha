import 'reflect-metadata';
import {
    JsonController,
    Get,
    Post,
    Body,
    Authorized,
    CurrentUser,
    QueryParams,
    HttpCode,
    BadRequestError,
} from 'routing-controllers';
import { inject, injectable } from 'inversify';
import { OpenAPI } from 'routing-controllers-openapi';
import { DASHBOARD_TYPES } from '../types.js';
import { ITesterLogService } from '../interfaces/ITesterLogService.js';
import { CreateTesterLogDto, GetTesterLogQuery } from '../validators/TesterLogValidators.js';

interface AuthenticatedUser {
    _id?: { toString(): string } | string;
    email: string;
    firstName?: string;
    lastName?: string;
}

@OpenAPI({
    tags: ['tester-log'],
    description: 'Tester test-case submission operations',
})
@JsonController('/tester-log')
@injectable()
export class TesterLogController {
    constructor(
        @inject(DASHBOARD_TYPES.TesterLogService)
        private readonly testerLogService: ITesterLogService,
    ) {}

    @OpenAPI({
        summary: 'Submit a new test case entry',
        description: 'Tester submits a test-case log entry. Tester name and user details are auto-populated from the authenticated user.',
    })
    @Authorized(['tester'])
    @Post('/')
    @HttpCode(201)
    async createEntry(
        @CurrentUser() currentUser: AuthenticatedUser,
        @Body() body: CreateTesterLogDto,
    ) {
        const userId = currentUser._id?.toString();
        if (!userId) throw new BadRequestError('Could not resolve user ID');

        const testerName =
            [currentUser.firstName, currentUser.lastName].filter(Boolean).join(' ').trim() ||
            currentUser.email;

        return this.testerLogService.createEntry(userId, currentUser.email, testerName, body);
    }

    @OpenAPI({
        summary: 'Get current testers own submissions',
        description: 'Returns a paginated list of test-case entries submitted by the authenticated tester.',
    })
    @Authorized(['tester'])
    @Get('/my')
    async getMyEntries(
        @CurrentUser() currentUser: AuthenticatedUser,
        @QueryParams() query: GetTesterLogQuery,
    ) {
        const userId = currentUser._id?.toString();
        if (!userId) throw new BadRequestError('Could not resolve user ID');
        const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
        return this.testerLogService.getMyEntries(
            userId,
            page,
            limit,
            query.startDate,
            query.endDate,
            query.dateField,
        );
    }

    @OpenAPI({
        summary: 'Get summary KPIs and breakdowns of current tester own submissions',
        description: 'Returns aggregated test metrics and breakdowns for the authenticated tester based on date filter.',
    })
    @Authorized(['tester'])
    @Get('/my-summary')
    async getMySummary(
        @CurrentUser() currentUser: AuthenticatedUser,
        @QueryParams() query: GetTesterLogQuery,
    ) {
        const userId = currentUser._id?.toString();
        if (!userId) throw new BadRequestError('Could not resolve user ID');
        return this.testerLogService.getMySummary(
            userId,
            query.startDate,
            query.endDate,
            query.dateField,
        );
    }


    @OpenAPI({
        summary: 'Get all tester submissions (admin only)',
        description: 'Returns a paginated list of all test-case entries from all testers. Optionally filter by testerId.',
    })
    @Authorized(['admin'])
    @Get('/all')
    async getAllEntries(
        @QueryParams() query: GetTesterLogQuery,
    ) {
        const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(query.limit ?? '20', 10) || 20));
        return this.testerLogService.getAllEntries(
            page,
            limit,
            query.testerId,
            query.startDate,
            query.endDate,
            query.dateField,
        );
    }
}
