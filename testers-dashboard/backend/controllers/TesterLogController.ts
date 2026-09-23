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
    Res,
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
        summary: 'Get all tester submissions (admin only)',
        description: 'Returns a paginated list of all test-case entries from all testers. Optionally filter by testerId, question type, channel, overall status, and defect severity.',
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
            query.typeOfQuestion,
            query.channelTested,
            query.overallTestStatus,
            query.defectSeverity,
        );
    }

    @OpenAPI({
        summary: 'Get testers with at least one submission (admin only)',
        description: 'Returns every distinct tester who has logged a test case, for the admin review table\'s Tester filter dropdown.',
    })
    @Authorized(['admin'])
    @Get('/testers')
    async getTesterOptions() {
        return this.testerLogService.getTesterOptions();
    }

    @OpenAPI({
        summary: 'Get summary stats for the tester review table (admin only)',
        description: 'Total entries, entries in the current filter/date range, and pass rate - for the selected tester (or all testers if none selected).',
    })
    @Authorized(['admin'])
    @Get('/summary')
    async getSummary(
        @QueryParams() query: GetTesterLogQuery,
    ) {
        return this.testerLogService.getSummary(
            query.testerId,
            query.startDate,
            query.endDate,
            query.dateField,
            query.typeOfQuestion,
            query.channelTested,
            query.overallTestStatus,
            query.defectSeverity,
        );
    }

    @OpenAPI({
        summary: 'Get question-type target achievement summary (admin only)',
        description: 'Each tester\'s question counts against the fixed per-question-type targets, for the Summary tab. Targets scale by the working days in the date range (calendar days × 6÷7, rounded - testers work 6 days a week with their own weekly day off), the same for every tester regardless of whether they logged anything. Returns a per-tester breakdown - sourced from the active tester roster, not just testers who happened to log an entry - when no testerId is given (All Testers).',
    })
    @Authorized(['admin'])
    @Get('/question-type-summary')
    async getQuestionTypeSummary(
        @QueryParams() query: GetTesterLogQuery,
    ) {
        return this.testerLogService.getQuestionTypeSummary(
            query.testerId,
            query.startDate,
            query.endDate,
        );
    }

    @OpenAPI({
        summary: 'Download every tester submission as Excel (admin only)',
        description: 'Generates the file server-side over every Google Sheet-matching column (not just the review table\'s visible ones) for every row in the collection - ignores the review table\'s on-screen filters and applies no pagination, by design, so the download always contains the complete dataset.',
    })
    @Authorized(['admin'])
    @Get('/export')
    async exportEntries(
        @Res() response: any,
    ): Promise<Buffer> {
        const result = await this.testerLogService.exportEntries();
        response.setHeader('Content-Type', result.contentType);
        response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
        return result.buffer;
    }
}
