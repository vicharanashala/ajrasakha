import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Body,
  HttpCode,
  Params,
  QueryParams,
  UseBefore,
  NotFoundError,
  BadRequestError,
  ForbiddenError,
  CurrentUser,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {IUser} from '#root/shared/interfaces/models.js';
import {FlexibleAuth} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {VerifyAnswerBody, QuestionIdParam, RecentReceiptsQuery} from '../classes/validators/VerificationValidators.js';
import {VerificationService} from '../services/VerificationService.js';

const REVIEW_ROLES = ['admin', 'moderator', 'pae_expert'];

@OpenAPI({
  tags: ['verification'],
  description: 'AjraVerify — deterministic safety gate for AI-generated agricultural answers',
})
@injectable()
@JsonController('/verification')
@UseBefore(FlexibleAuth)
export class VerificationController {
  constructor(
    @inject(GLOBAL_TYPES.VerificationService)
    private readonly verificationService: VerificationService,
  ) {}

  // ─── CHECK AN ANSWER ───────────────────────────────────────────────────

  @OpenAPI({
    summary: 'Verify an answer text through the AjraVerify gate',
    description:
      'Extracts factual claims (chemicals, dosages, intervals, spray counts), resolves them against the trusted chemical/crop catalogues, decides a verdict (VERIFIED / CONDITIONAL / REVIEW_REQUIRED / BLOCKED) and persists a receipt. Deterministic — no LLM involved.',
  })
  @Post('/check')
  @HttpCode(200)
  async check(
    @Body() body: VerifyAnswerBody,
    @CurrentUser() user: IUser,
  ) {
    const result = await this.verificationService.verifyAnswer({
      answerText: body.answerText,
      questionId: body.questionId ?? null,
      answerId: body.answerId ?? null,
    });
    return {
      success: true,
      data: result,
      checkedBy: {_id: user?._id?.toString?.() ?? null, role: user?.role ?? 'api-key'},
    };
  }

  // ─── RECEIPT FOR A QUESTION ────────────────────────────────────────────

  @OpenAPI({
    summary: 'Get the latest verification receipt for a question',
    description: 'Returns the most recent AjraVerify receipt recorded for the given question id, if any.',
  })
  @Get('/receipt/:questionId')
  @HttpCode(200)
  async getReceipt(@Params() params: QuestionIdParam) {
    const receipt = await this.verificationService.getReceiptByQuestionId(params.questionId);
    if (!receipt) {
      throw new NotFoundError(`No verification receipt found for question "${params.questionId}".`);
    }
    return {success: true, data: receipt};
  }

  // ─── RECENT RECEIPTS ───────────────────────────────────────────────────

  @OpenAPI({
    summary: 'List recent verification receipts',
    description: 'Latest gate decisions, newest first. Review/dashboard ready.',
  })
  @Get('/receipts')
  @HttpCode(200)
  async getRecent(@QueryParams() query: RecentReceiptsQuery) {
    const receipts = await this.verificationService.getRecentReceipts(query?.limit ?? 50, query?.verdict);
    // `total` reflects the same filter as the returned page, so clients can
    // page through a verdict without the count disagreeing with the data.
    const total = await this.verificationService.countReceipts(query?.verdict);
    return {success: true, data: receipts, total};
  }
}
