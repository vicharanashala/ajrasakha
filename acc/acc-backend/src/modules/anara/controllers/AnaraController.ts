import 'reflect-metadata';
import {
  JsonController,
  Post,
  Get,
  Patch,
  Body,
  Param,
  QueryParam,
  HeaderParam,
  Req,
  Res,
  HttpCode,
  Authorized,
  CurrentUser,
  BadRequestError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import type { Response } from 'express';
import { GLOBAL_TYPES } from '#root/types.js';
import type {
  IAnaraService,
  AnaraDraftResponse,
  SubmitForReviewDto,
  ReviewWebhookPayload,
} from '../types.js';
import type { FarmerFollowUpStatus } from '#root/shared/database/interfaces/ICallDetailsRepository.js';

class DraftBodyDto {
  question!: string;
  crop?: string | null;
  state?: string | null;
  domain?: string | null;
}

class SubmitForReviewBodyDto implements SubmitForReviewDto {
  callUuid!: string;
  question!: string;
  answer!: string;
  citations?: any[];
  crop?: string | null;
  state?: string | null;
  district?: string | null;
  block?: string | null;
  village?: string | null;
  season?: string | null;
  domain?: string | string[] | null;
}

class ReviewWebhookBodyDto implements ReviewWebhookPayload {
  question_id!: string;
  status!: string;
  question?: string;
  answer?: string;
  author?: string;
  source?: string;
  sources?: any[];
  details?: any;
  [key: string]: any;
}

class UpdateFollowUpBodyDto {
  status!: FarmerFollowUpStatus;
  notes?: string;
}

@OpenAPI({
  tags: ['anara'],
  description: 'Anara / Package of Practices (POP) Library Integration & Review System Endpoints',
})
@injectable()
@JsonController('/anara')
export class AnaraController {
  constructor(
    @inject(GLOBAL_TYPES.AnaraService)
    private readonly anaraService: IAnaraService,
  ) { }

  @Post('/draft')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Draft an answer grounded in the POP library with passage citations',
    description: 'Searches translated agricultural Package of Practices (POP) documents and drafts an answer using MiniMax with [P#] citations.',
  })
  async draft(
    @Body({ required: true }) body: DraftBodyDto,
  ): Promise<AnaraDraftResponse> {
    if (!body?.question || !body.question.trim()) {
      throw new BadRequestError('Question is required');
    }

    return await this.anaraService.draft(
      body.question,
      body.crop,
      body.domain,
      body.state,
    );
  }

  @Get('/documents/:documentId/pdf')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Stream the PDF of a cited library document',
    description: 'Returns the cited Package of Practices PDF file inline so the agent can inspect the source page.',
  })
  async getDocumentPdf(
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    if (!documentId) {
      throw new BadRequestError('Document ID is required');
    }

    const pdfBuffer = await this.anaraService.getDocumentPdf(documentId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    response.setHeader('Content-Length', pdfBuffer.length);
    return response.send(pdfBuffer);
  }

  @Post('/submit-for-review')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Submit AI draft to Review System for Moderator verification',
    description: 'Persists query into call_queries as AI-drafted with a 2h SLA and dispatches it to the Review System queue.',
  })
  async submitForReview(
    @Body({ required: true }) body: SubmitForReviewBodyDto,
    @CurrentUser() currentUser?: any,
    @Req() req?: any,
  ) {
    if (!body?.question || !body.question.trim()) {
      throw new BadRequestError('Question is required');
    }
    if (!body?.callUuid || !body.callUuid.trim()) {
      throw new BadRequestError('callUuid is required');
    }

    const agentUserId = currentUser?._id
      ? String(currentUser._id)
      : (currentUser?.agent || currentUser?.firebaseUID || req?.user?.id || req?.user?._id || req?.user?.uid);

    // console.log(`[AnaraController] Submitting AI draft for review (callUuid: ${body.callUuid}, agent: ${agentUserId || 'unknown'})`);

    try {
      const result = await this.anaraService.submitForReview(body, agentUserId);
      console.log(`[AnaraController] Successfully submitted query ${result.queryId} for review: status ${result.reviewStatus}`);
      return result;
    } catch (error: any) {
      console.error(`[AnaraController] Error submitting AI draft for review (callUuid: ${body.callUuid}):`, error?.message || error);
      throw error;
    }
  }

  @Post('/retry-submission/:queryId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Retry submitting a previously failed AI draft to Review System',
  })
  async retrySubmission(@Param('queryId') queryId: string) {
    if (!queryId) {
      throw new BadRequestError('Query ID is required');
    }
    return await this.anaraService.retryReviewSubmission(queryId);
  }

  @Post('/review-webhook')
  @HttpCode(200)
  @OpenAPI({
    summary: 'Receive webhook notification when Moderator approves/closes question in Review System',
    description: 'Receives question_id, status, verified answer, author, and sources from Review System.',
  })
  async handleReviewWebhook(
    @Body({ required: true }) body: ReviewWebhookBodyDto,
    @HeaderParam('x-internal-api-key') internalApiKey?: string,
    @HeaderParam('x-webhook-secret') webhookSecret?: string,
  ) {
    const authHeader = internalApiKey || webhookSecret;
    return await this.anaraService.handleReviewWebhook(body, authHeader);
  }

  @Get('/follow-ups')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Get AI-drafted queries for follow-up and SLA tracking',
    description: 'Lists AI-drafted queries, filterable by reviewStatus and farmerFollowUpStatus.',
  })
  async getFollowUps(
    @QueryParam('status') status?: string,
    @QueryParam('followUpStatus') followUpStatus?: string,
    @QueryParam('limit') limit?: number,
    @QueryParam('offset') offset?: number,
  ) {
    return await this.anaraService.getFollowUps(status, followUpStatus, limit, offset);
  }

  @Patch('/follow-ups/:queryId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary: 'Update farmer follow-up status (e.g. called, resolved)',
  })
  async updateFollowUp(
    @Param('queryId') queryId: string,
    @Body({ required: true }) body: UpdateFollowUpBodyDto,
  ) {
    if (!queryId) {
      throw new BadRequestError('Query ID is required');
    }
    if (!body?.status) {
      throw new BadRequestError('Follow-up status is required');
    }
    const updated = await this.anaraService.updateFollowUpStatus(queryId, body.status, body.notes);
    return { success: true, data: updated };
  }
}

