import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Patch,
  Body,
  HttpCode,
  Params,
  QueryParams,
  Authorized,
  CurrentUser,
  NotFoundError,
  BadRequestError,
  InternalServerError,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser } from '#root/shared/interfaces/models.js';
import { BadRequestErrorResponse } from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import {
  ApproveInitialAnswerBody,
  QuestionIdParam,
} from '../classes/validators/QuestionVaidators.js';
import { IQuestionService } from '../interfaces/IQuestionService.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { UserService } from '#root/modules/user/index.js';
import { roleAuditActor } from './helpers/questionAuditHelper.js';

@OpenAPI({
  tags: ['questions'],
  description: 'Operations for chatbot details, duplicate checks, hold status, and AI initial answer generation & approval',
})
@injectable()
@JsonController('/questions')
export class QuestionAiController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,

    @inject(GLOBAL_TYPES.UserService)
    private readonly userService: UserService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @Get('/:questionId/chatbot')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get full chatbot details of selected question by ID' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async getChatbotDetails(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ) {
    const { questionId } = params;
    const userId = user._id.toString();
    const data = await this.questionService.getMatchedQuestion(
      questionId,
      userId,
    );

    if (!data) {
      throw new NotFoundError(`Question with id ${questionId} not found`);
    }

    return {
      success: true,
      data: {
        messageId: data.messageId,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        user: data.user,
        content: data.content,
      },
    };
  }

  @Post('/:questionId/check-duplicate')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({
    summary:
      'Manually trigger duplicate check for a question without a reference question',
  })
  async manualCheckDuplicate(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.CHECK_DUPLICATE,
      actor: roleAuditActor(user),
      context: { questionId },
      createdAt: new Date(),
    };
    try {
      const result =
        await this.questionService.manualCheckDuplicate(questionId);
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to check duplicate',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      throw err;
    }
  }

  @Patch('/:questionId/hold')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'To hold the question for some time' })
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async holdQuestion(
    @Params() params: QuestionIdParam,
    @CurrentUser() user: IUser,
    @Body() body: { action: 'hold' | 'unhold' },
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const { action } = body;

    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action:
        action === 'hold'
          ? AuditAction.QUESTION_HOLD
          : AuditAction.QUESTION_UNHOLD,
      actor: roleAuditActor(user),
      context: { questionId },
      createdAt: new Date(),
    };

    try {
      const result = await this.questionService.holdQuestion(
        questionId,
        user._id.toString(),
        action,
      );
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: { after: { action, questionId } },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorMessage: err?.message,
        },
      });
      throw err;
    }
  }

  @Get('/:questionId/generate-answer')
  @HttpCode(200)
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Generate ai-initial answer' })
  async generateAiInitialAnswer(
    @Params() params: QuestionIdParam,
    @QueryParams() query: { userId: string },
  ) {
    const { questionId } = params;
    const { userId } = query;
    let response;
    let auditPayload: ModeratorAuditTrail | undefined;
    if (userId) {
      const user = await this.userService.getUserById(userId);
      const prevQuestion =
        await this.questionService.getQuestionById(questionId);
      auditPayload = {
        category: AuditCategory.AI_GENERATED,
        action: AuditAction.GENERATE_ANSWER,
        actor: roleAuditActor(user),
        context: {
          questionId: questionId,
          question: prevQuestion.text,
        },
        changes: {
          before: {
            aiInitialAnswer: prevQuestion.aiInitialAnswer || null,
          },
        },
        outcome: {
          status: OutComeStatus.SUCCESS,
        },
      };
    }
    try {
      response =
        await this.questionService.generateAiInitialAnswer(questionId);
    } catch (err: any) {
      if (userId && auditPayload) {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorCode: err?.errorCode || 'INTERNAL_ERROR',
            errorMessage:
              err?.message || 'Failed to generate AI initial answer',
            errorName: err?.name || 'Error',
            errorStack:
              err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
              'No stack trace available',
          },
        };
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate AI initial answer',
      );
    }
    if (userId && auditPayload) {
      auditPayload = {
        ...auditPayload,
        changes: {
          ...auditPayload.changes,
          after: {
            aiInitialAnswer: response || null,
          },
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
    }
    return response;
  }

  @Post('/:questionId/approve-initial-answer')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  @OpenAPI({ summary: 'Generate ai-initial answer' })
  async approveInitialAnswer(
    @Params() params: QuestionIdParam,
    @Body() body: ApproveInitialAnswerBody,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const { questionId } = params;
    const { answer } = body;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.QUESTION,
      action: AuditAction.APPROVE_AI_INITIAL_ANSWER,
      actor: roleAuditActor(user),
      context: { questionId },
      createdAt: new Date(),
    };
    try {
      const result = await this.questionService.approveAiInitialAnswer(
        questionId,
        answer,
      );
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        changes: { after: { answer: answer?.substring(0, 200) } },
        outcome: { status: OutComeStatus.SUCCESS },
      });
      return result;
    } catch (err: any) {
      this.auditTrailsService.createAuditTrail({
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to approve initial answer',
          errorName: err?.name || 'Error',
          errorStack:
            err?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to approve initial answer',
      );
    }
  }
}
