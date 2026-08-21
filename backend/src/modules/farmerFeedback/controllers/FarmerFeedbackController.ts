import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  Body,
  QueryParams,
  Authorized,
  CurrentUser,
  BadRequestError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { FARMER_FEEDBACK_TYPES } from '../types.js';
import type { IFarmerFeedbackService, SubmitFarmerFeedbackDTO } from '../interfaces/IFarmerFeedbackService.js';
import { IFarmerFeedbackFilterQuery } from '#root/shared/interfaces/farmerFeedback.js';
import { IUser } from '#root/shared/index.js';

@OpenAPI({
  tags: ['farmer-feedback'],
  description: 'Farmer Answer Feedback Loop endpoints for WhatsApp and Reviewer pipeline',
})
@injectable()
@JsonController('/farmer-feedback', { transformResponse: false })
export class FarmerFeedbackController {
  constructor(
    @inject(FARMER_FEEDBACK_TYPES.FarmerFeedbackService)
    private readonly feedbackService: IFarmerFeedbackService,
  ) {}

  @OpenAPI({
    summary: 'Submit farmer answer feedback',
    description: 'Captures rating (1 for Yes, 2 for No) and feedback details from WhatsApp/App.',
  })
  @Post('/')
  @HttpCode(201)
  async submitFeedback(@Body() body: SubmitFarmerFeedbackDTO) {
    if (!body.questionId) {
      throw new BadRequestError('questionId is required');
    }
    if (body.rating !== 1 && body.rating !== 2) {
      throw new BadRequestError('Rating must be 1 (Helpful/Yes) or 2 (Not Helpful/No)');
    }

    const created = await this.feedbackService.submitFeedback(body);
    return {
      success: true,
      message: 'Feedback submitted successfully',
      data: created,
    };
  }

  @OpenAPI({
    summary: 'Get feedback overall metrics',
    description: 'Retrieves helpfulness percentages, positive/negative counts, and evaluated GDB counts.',
  })
  @Get('/metrics')
  @HttpCode(200)
  async getMetrics(@QueryParams() query: IFarmerFeedbackFilterQuery) {
    const metrics = await this.feedbackService.getMetrics(query);
    return {
      success: true,
      data: metrics,
    };
  }

  @OpenAPI({
    summary: 'Get domain, language, and state breakdowns',
    description: 'Retrieves categorical satisfaction breakdowns.',
  })
  @Get('/breakdowns')
  @HttpCode(200)
  async getBreakdowns(@QueryParams() query: IFarmerFeedbackFilterQuery) {
    const breakdowns = await this.feedbackService.getBreakdowns(query);
    return {
      success: true,
      data: breakdowns,
    };
  }

  @OpenAPI({
    summary: 'Get GDB feedback summaries leaderboard',
    description: 'Retrieves per-GDB entry scores, response counts, and flag statuses with pagination.',
  })
  @Get('/gdb-summaries')
  @HttpCode(200)
  async getGDBFeedbackSummaries(@QueryParams() query: IFarmerFeedbackFilterQuery) {
    const { summaries, total } = await this.feedbackService.getGDBFeedbackSummaries(query);
    const page = Number(query?.page) || 1;
    const limit = Number(query?.limit) || 20;

    return {
      success: true,
      data: summaries,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  @OpenAPI({
    summary: 'Trigger automated flagging pipeline',
    description: 'Scans GDB entries with low helpfulness (<60%) and auto-injects them into reviewer queue.',
  })
  @Post('/trigger-flagging')
  @HttpCode(200)
  async triggerFlagging(
    @Body({ required: false })
    body?: { thresholdPercentage?: number; minResponses?: number },
  ) {
    const threshold = body?.thresholdPercentage ?? 60;
    const minResponses = body?.minResponses ?? 10;
    const result = await this.feedbackService.runAutoFlaggingPipeline(threshold, minResponses);
    return {
      success: true,
      data: result,
    };
  }

  @OpenAPI({
    summary: 'Manually flag a GDB entry for re-review',
    description: 'Flags a specific GDB question and sends it to the reviewer pipeline.',
  })
  @Post('/flag-manual')
  @HttpCode(200)
  async flagManual(
    @Body() body: { questionId: string; reason?: string },
  ) {
    if (!body.questionId) {
      throw new BadRequestError('questionId is required');
    }
    await this.feedbackService.flagGDBEntryManually(body.questionId, body.reason);
    return {
      success: true,
      message: `GDB entry ${body.questionId} flagged for expert re-review`,
    };
  }

  @OpenAPI({
    summary: 'Get weekly agri team digest report',
    description: 'Provides a digest of the lowest-rated GDB entries and top complaint areas.',
  })
  @Get('/weekly-digest')
  @HttpCode(200)
  async getWeeklyDigest() {
    const digest = await this.feedbackService.generateWeeklyDigestReport();
    return {
      success: true,
      data: digest,
    };
  }
}
