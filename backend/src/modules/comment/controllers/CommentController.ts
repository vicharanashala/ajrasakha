import {
  JsonController,
  Get,
  Params,
  QueryParams,
  Authorized,
  HttpCode,
  Body,
  Post,
  CurrentUser,
  InternalServerError,
  BadRequestError,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {IComment, IUser} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject} from 'inversify';
import { CommentService } from '../services/CommentService.js';
import { AddCommentBody, AddCommentParams, GetCommentsParams, GetCommentsQuery } from '../classes/validators/CommentValidator.js';
import { CommentErrorResponse, GetCommentsResponse, AddCommentResponse } from '../classes/validators/CommentResponseValidators.js';
import { ICommentService } from '../interfaces/ICommentService.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { IQuestionService } from '#root/modules/question/interfaces/IQuestionService.js';

@OpenAPI({
  tags: ['Comments'],
  description: 'Operations related to comments',
})
@JsonController('/comments')
export class CommentController {
  constructor(
    @inject(GLOBAL_TYPES.CommentService)
    private commentService: ICommentService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,

    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,
  ) {}

  @OpenAPI({
    summary: 'Get comments for a specific answer of a question',
    description: 'Retrieves paginated comments for a specific answer. Returns an array of comments with user information and the total count.',
  })
  @ResponseSchema(GetCommentsResponse, {
    statusCode: 200,
    description: 'Comments retrieved successfully with pagination metadata',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid question or answer ID format',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 404,
    description: 'Not found - Question or answer not found',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch comments',
  })
  @Get('/question/:questionId/answer/:answerId')
  @HttpCode(200)
  @Authorized()
  async getComments(
    @Params() params: GetCommentsParams,
    @QueryParams() query: GetCommentsQuery,
  ): Promise<{comments: IComment[]; total: number}> {
    const page = query.page ? Number(query.page) : 1;
    const limit = query.limit ? Number(query.limit) : 10;

    return this.commentService.getComments(
      params.questionId,
      params.answerId,
      page,
      limit,
    );
  }

  @OpenAPI({
    summary: 'Add a comment to a specific answer of a question',
    description: 'Adds a new comment to a specific answer. Also triggers a notification to the answer author.',
  })
  @ResponseSchema(AddCommentResponse, {
    statusCode: 201,
    description: 'Comment added successfully',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid question ID, answer ID, or missing comment text',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 404,
    description: 'Not found - Question or answer not found',
  })
  @ResponseSchema(CommentErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to add comment',
  })
  @Post('/question/:questionId/answer/:answerId')
  @HttpCode(201)
  @Authorized()
  async addComment(
    @Params() params: AddCommentParams,
    @Body() body: AddCommentBody,
    @CurrentUser() user: IUser,
  ): Promise<boolean> {
    const {answerId, questionId} = params;
    const {text} = body;
    const userId = user._id.toString();
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.EXPERTS_CATEGORY,
      action: AuditAction.EXPERTS_ADD_COMMENT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
       },
      context: {
        questionId: questionId,
        answerId: answerId,
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    }
    let result;
    let questionDetails;
    try{
      result  = await this.commentService.addComment(questionId, answerId, text, userId);
      questionDetails = await this.questionService.getQuestionById(questionId);
    } catch(err: any){
      auditPayload = {
        ...auditPayload,
        context: {
          ...auditPayload.context,
          question: questionDetails?.text,
          },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to add comment',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
          },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if(err instanceof InternalServerError){
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to add comment',
      );
    }
    auditPayload = {
      ...auditPayload,
      context: {
        ...auditPayload.context,
        question: questionDetails.text,
      },
      changes: {
        after: {
          commentText: text,
        },
      },
      outcome: {
        status: result ? OutComeStatus.SUCCESS : OutComeStatus.FAILED,
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result;
  }
}
