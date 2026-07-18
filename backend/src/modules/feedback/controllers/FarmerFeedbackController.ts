import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  Param,
  Body,
  Authorized,
  QueryParam,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { FarmerFeedbackService } from '../services/FarmerFeedbackService.js';

@OpenAPI({
  tags: ['feedback'],
  description: 'Farmer Answer Feedback Loop endpoints for WhatsApp and Web',
})
@injectable()
@JsonController('/feedback', { transformResponse: false })
export class FarmerFeedbackController {
  constructor(
    @inject(FarmerFeedbackService)
    private readonly feedbackService: FarmerFeedbackService,
  ) {}

  @OpenAPI({
    summary: 'Capture Farmer Answer Feedback',
    description: 'Receives Reply 1 (Yes) or Reply 2 (No) from WhatsApp bot or dashboard and stores feedback linked to GDB entry.',
  })
  @Post('/capture')
  @HttpCode(200)
  async captureFeedback(
    @Body()
    body: {
      phoneNumber?: string;
      userId?: string;
      reply: '1' | '2';
      gdbEntryId: string;
      questionId?: string;
      domain?: string;
      language?: string;
      state?: string;
    },
  ) {
    if (body.reply !== '1' && body.reply !== '2') {
      return { success: false, message: 'Invalid reply. Expected Reply 1 for Yes or Reply 2 for No.' };
    }

    const result = await this.feedbackService.recordFeedback(body);
    return {
      success: true,
      message: result.isHelpful
        ? 'Thank you for your positive feedback!'
        : 'Thank you for your feedback. We have noted your response to improve this answer.',
      data: result,
    };
  }

  @OpenAPI({
    summary: 'Get Helpfulness Analytics Dashboard Data',
    description: 'Returns helpfulness rates sliced by GDB entry, domain, language, and state.',
  })
  @Get('/analytics')
  @HttpCode(200)
  // @Authorized()
  async getAnalytics(
    @QueryParam('domain') domain?: string,
    @QueryParam('language') language?: string,
    @QueryParam('state') state?: string,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
  ) {
    return this.feedbackService.getHelpfulnessAnalytics({
      domain,
      language,
      state,
      startDate,
      endDate,
    });
  }

  @OpenAPI({
    summary: 'Trigger Re-Review for a specific GDB Entry',
    description: 'Manually or automatically triggers re-review flag in Question repository if threshold is breached.',
  })
  @Post('/trigger-rereview/:gdbEntryId')
  @HttpCode(200)
  @Authorized()
  async triggerReReview(@Param('gdbEntryId') gdbEntryId: string) {
    return this.feedbackService.triggerReReviewForEntry(gdbEntryId);
  }

  @OpenAPI({
    summary: 'Get Weekly Feedback Digest',
    description: 'Generates weekly feedback report for the agricultural team with helpfulness rates and low-performing entries.',
  })
  @Get('/weekly-digest')
  @HttpCode(200)
  // @Authorized()
  async getWeeklyDigest() {
    return this.feedbackService.getWeeklyDigest();
  }
}
