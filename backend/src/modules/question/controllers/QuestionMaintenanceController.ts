import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Body,
  HttpCode,
  Param,
  QueryParam,
  BadRequestError,
  UseBefore,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { CORE_TYPES } from '#root/modules/core/types.js';
import { getBackgroundJobs, getJobById } from '#root/workers/workerManager.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';
import { CheckOverlapsService } from '../services/CheckOverlapsService.js';
import { InternalApiAuth } from '#root/shared/index.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for background jobs, admin maintenance, geo-normalization, and migrations',
})
@injectable()
@JsonController('/questions')
export class QuestionMaintenanceController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(CORE_TYPES.CheckOverlapsService)
    private readonly checkOverlapsService: CheckOverlapsService,
  ) {}

  @Get('/background-status')
  @OpenAPI({ summary: 'Get status of all background worker jobs' })
  getAllJobs() {
    return getBackgroundJobs();
  }

  @Get('/background/jobs/:id')
  @OpenAPI({ summary: 'Get status of a specific background job by ID' })
  getJob(@Param('id') id: string) {
    const job = getJobById(id);
    if (!job) return { message: 'Job not found' };
    return job;
  }

  // Two-segment static path so it isn't captured by the single-segment `/:questionId` route.
  @Get('/admin/closed-answer-mismatch')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Diagnostic: closed questions in a window with no final answer / no ObjectId approvedBy (breakdown mismatch)',
  })
  async getClosedAnswerMismatch(
    @QueryParam('startTime') startTime?: string,
    @QueryParam('endTime') endTime?: string,
  ) {
    const start = startTime ? new Date(startTime) : undefined;
    const end = endTime ? new Date(endTime) : undefined;
    const data = await this.questionService.getClosedAnswerMismatch(start, end);
    return { success: true, data };
  }

  // Two-segment static path so it isn't captured by the single-segment `/:questionId` route.
  @Post('/admin/normalized-domain')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Bulk-set normalizedDomain on questions from [{ "Question ID", "Standardized Domain" }]; returns modified / not-matched counts',
  })
  async setNormalizedDomains(
    @Body()
    body:
      | { 'Question ID'?: string; 'Standardized Domain'?: string }[]
      | { data?: any[] },
  ) {
    const entries = Array.isArray(body) ? body : body?.data ?? [];
    const result = await this.questionService.setNormalizedDomains(
      entries as any,
    );
    return { success: true, data: result };
  }

  // Two-segment static path so it isn't captured by the single-segment `/:questionId` route.
  @Post('/admin/backfill-closed-moderator')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Backfill moderatorId on closed questions (moderatorId null/missing) from the final answer approver',
  })
  async backfillClosedModeratorIds(@Body() body: { limit?: number }) {
    const safeLimit = Math.max(1, Math.min(Number(body?.limit) || 500, 2000));
    const result =
      await this.questionService.backfillClosedModeratorIds(safeLimit);
    return { success: true, data: result };
  }

  // ─── Migration & Data Fix Endpoints (internal API key auth) ───────────────

  @Post('/background/process')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({ summary: 'Background process for repo actions' })
  async backgroundProcessAction(@Body() body: { userId: string }) {
    const { userId } = body;
    if (!userId) {
      throw new BadRequestError('userId is required');
    }
    const result = await this.questionService.backgroundProcessAction(userId);
    return result;
  }

  @Post('/background/remove-history-entry')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary: 'Remove a submission history entry by index (internal data fix)',
  })
  async removeSubmissionHistoryEntry(
    @Body() body: { questionId: string; index: number },
  ) {
    const { questionId, index } = body;
    if (!questionId) {
      throw new BadRequestError('questionId is required');
    }
    if (index === undefined || index === null) {
      throw new BadRequestError('index is required');
    }
    return await this.questionService.removeSubmissionHistoryEntry(
      questionId,
      Number(index),
    );
  }

  @Post('/background/remove-queue-entry')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Remove an expert from a submission queue by index (internal data fix)',
  })
  async removeSubmissionQueueEntry(
    @Body() body: { questionId: string; index: number },
  ) {
    const { questionId, index } = body;
    if (!questionId) {
      throw new BadRequestError('questionId is required');
    }
    if (index === undefined || index === null) {
      throw new BadRequestError('index is required');
    }
    return await this.questionService.removeSubmissionQueueEntry(
      questionId,
      Number(index),
    );
  }

  @Post('/background/add-queue-entry')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary: 'Add an expert to a submission queue (internal data fix)',
  })
  async addSubmissionQueueEntry(
    @Body() body: { questionId: string; expertId: string },
  ) {
    const { questionId, expertId } = body;
    if (!questionId) {
      throw new BadRequestError('questionId is required');
    }
    if (!expertId) {
      throw new BadRequestError('expertId is required');
    }
    return await this.questionService.addSubmissionQueueEntry(
      questionId,
      expertId,
    );
  }

  @Post('/background/add-history-entry')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary: 'Add a submission history entry (internal data fix)',
  })
  async addSubmissionHistoryEntry(
    @Body() body: { questionId: string; entry: Record<string, any> },
  ) {
    const { questionId, entry } = body;
    if (!questionId) {
      throw new BadRequestError('questionId is required');
    }
    if (!entry || typeof entry !== 'object') {
      throw new BadRequestError('entry object is required');
    }
    return await this.questionService.addSubmissionHistoryEntry(
      questionId,
      entry,
    );
  }

  @Post('/background/normalize-state')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Standardise a state name across all questions (internal data fix). Sets details.state to `standardizedTo` for every question whose details.state is one of `current`.',
  })
  async normalizeQuestionState(
    @Body() body: { current: string[]; standardizedTo: string },
  ) {
    const { current, standardizedTo } = body;
    if (!Array.isArray(current) || current.length === 0) {
      throw new BadRequestError(
        'current must be a non-empty array of state values',
      );
    }
    if (!standardizedTo || typeof standardizedTo !== 'string') {
      throw new BadRequestError('standardizedTo is required');
    }
    return await this.questionService.normalizeQuestionState(
      current,
      standardizedTo,
    );
  }

  @Post('/background/normalize-district')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Standardise question district names against the districts collection (internal data fix). Body: [{ existingName, standardiseTo }]. When `standardiseTo` is a known districtNameEnglish, questions with details.district === existingName are updated to it; names not found in the districts collection are returned in `notMatching`.',
  })
  async normalizeQuestionDistricts(
    @Body() body: { existingName: string; standardiseTo: string }[],
  ) {
    if (!Array.isArray(body) || body.length === 0) {
      throw new BadRequestError(
        'body must be a non-empty array of { existingName, standardiseTo }',
      );
    }
    return await this.questionService.normalizeQuestionDistricts(body);
  }

  @Get('/background/unknown-geo')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      "Audit question geo (internal). Scans every question's details.state / details.district and returns the distinct values that do NOT exist in the states (stateNameEnglish) / districts (districtNameEnglish) collections.",
  })
  async findUnknownQuestionGeo() {
    return await this.questionService.findUnknownQuestionGeo();
  }

  // ─── Database Overlaps & Migration Endpoints ──────────────────────────────

  @Post('/check-overlaps')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Check for overlapping documents between staging and production databases',
  })
  async checkOverlaps() {
    console.log(
      '[QuestionMaintenanceController] checkOverlaps: Starting overlap check...',
    );
    const result = await this.checkOverlapsService.checkOverlaps();
    return result;
  }

  @Post('/run-migration')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({ summary: 'Run migration from staging to production database' })
  async runMigration() {
    console.log(
      '[QuestionMaintenanceController] runMigration: Starting migration...',
    );
    const result = await this.checkOverlapsService.runMigration();
    return result;
  }

  @Post('/migrate-firebase-users')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary:
      'Migrate Firebase users for staging users - creates new Firebase users and updates their UIDs',
  })
  async migrateFirebaseUsers() {
    console.log(
      '[QuestionMaintenanceController] migrateFirebaseUsers: Starting Firebase user migration...',
    );
    const result = await this.checkOverlapsService.migrateFirebaseUsers();
    return result;
  }
}
