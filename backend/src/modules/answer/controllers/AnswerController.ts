import 'reflect-metadata';
import {
  JsonController,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  Params,
  CurrentUser,
  Authorized,
  QueryParams,
  Put,
  BadRequestError,
  InternalServerError,
  ForbiddenError,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import { verifyNotTester } from '#root/shared/functions/verifyNotTester.js';
import {IAnswer, IUser} from '#root/shared/interfaces/models.js';
import { AnswerService } from '../services/AnswerService.js';
import { AddAnswerBody, AnswerIdParam, DeleteAnswerParams, FetchAiInitialAnswerBody, ReviewAnswerBody, SubmissionResponse, UpdateAnswerBody } from '../classes/validators/AnswerValidator.js';
import { IAnswerService } from '../interfaces/IAnswerService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { IQuestionService } from '#root/modules/question/interfaces/index.js';

@OpenAPI({
  tags: ['Answers'],
  description: 'Operations related to answers',
})
@JsonController('/answers')
export class AnswerController {
  constructor(
    @inject(GLOBAL_TYPES.AnswerService)
    private readonly answerService: IAnswerService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,

    @inject(GLOBAL_TYPES.QuestionService)
    private readonly questionService: IQuestionService,
  ) {}

  @OpenAPI({summary: 'Add a new answer to a question'})
  @Post('/')
  @HttpCode(201)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async addAnswer(@Body() body: AddAnswerBody, @CurrentUser() user: IUser) {
    verifyNotTester(user);
    const {questionId, answer, sources} = body;
    const authorId = user._id.toString();
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ANSWER,
      action: AuditAction.SUBMIT_ANSWER,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId },
      createdAt: new Date(),
    };
    try {
      const result = await this.answerService.addAnswer(questionId, authorId, answer, sources);
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
          errorMessage: err?.message || 'Failed to add answer',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to add answer');
    }
  }

  @OpenAPI({summary: 'review and add a new answer to a question'})
  @Post('/review')
  @HttpCode(201)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async reviewAnswer(
    @Body() body: ReviewAnswerBody,
    @CurrentUser() user: IUser,
  ): Promise<{message: string}> {
    verifyNotTester(user);
    const userId = user._id.toString();
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ANSWER,
      action: AuditAction.REVIEW_ANSWER,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        questionId: body.questionId,
        type: body.type,
        status: body.status,
      },
      createdAt: new Date(),
    };
    try {
      let result;
      if(body.type=="reroute")
      {
        result = await this.answerService.reRouteReviewAnswer(userId, body);
      } else {
        result = await this.answerService.reviewAnswer(userId, body);
      }
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
          errorMessage: err?.message || 'Failed to review answer',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to review answer');
    }
  }

  @OpenAPI({summary: 'Fetch AI initial answer through backend proxy'})
  @Post('/fetch-ai-answer')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async fetchAiInitialAnswer(@Body() body: FetchAiInitialAnswerBody) {
    return this.answerService.fetchAiInitialAnswer(body);
  }

  @Get('/submissions')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(SubmissionResponse, {isArray: true})
  @OpenAPI({summary: 'Get all submissions'})
  async getUnAnsweredQuestions(
    @QueryParams() query: {page?: number; limit?: number; start:string | undefined,end:string | undefined,selectedHistoryId:string|undefined,expertId?:string|undefined},
    @CurrentUser() user: IUser,
  ): Promise<SubmissionResponse[]> {
    const page = Number(query.page) ?? 1;
    const limit = Number(query.limit) ?? 10;
    const userId = user._id.toString();
    const selectedHistoryId=query.selectedHistoryId
    const expertId=query.expertId
    let dateRange=undefined
    if(query.start && query.end){
    let end = new Date(query.end as string);
    end.setHours(23,59,59,999)
    dateRange = {from:new Date(query.start as string),to:end}
    }
    return this.answerService.getSubmissions(userId, page, limit,dateRange,selectedHistoryId,expertId);
  }
  @Get('/finalizedAnswers')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(SubmissionResponse, {isArray: true})
  @OpenAPI({summary: 'Get all FinalizedAnswers'})
  async getfinalAnswerQuestions(
    @QueryParams() query: {userId,date,status},
    @CurrentUser() user: IUser,
  ): Promise<{
    finalizedSubmissions: any[],
    
   
  }>  {
   
    const userId = query?.userId || "all";
    const date=query?.date || "all";
    const status=query?.status || "all";
    const currentUserId = user._id.toString(); // Default to "all" if not passed
  
    return this.answerService.getFinalAnswerQuestions(userId,currentUserId,date,status);
  }

 /* @OpenAPI({summary: 'Update an existing answer'})
  @Put('/:answerId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async approveAnswer(
    @Params() params: AnswerIdParam,
    @Body() body: UpdateAnswerBody,
    @CurrentUser() user: IUser,
  ) {
    const {answerId} = params;
    const {_id: userId} = user;
    return this.answerService.approveAnswer(userId.toString(), answerId, body);
  }*/
  @OpenAPI({ summary: 'Update or create answer (supports ajrasakha)' })
  @Put('/')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async approveAnswer(
    @Body() body: UpdateAnswerBody,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const {_id: userId} = user;
    let result;
    let prevAnswer;
    const hasAnswerId = !!body.answerId;
    let questionData;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ANSWER,
      action: AuditAction.APPROVE_ANSWER,
      actor: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        answerId: body.answerId,
      },
      changes: {},
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      if (hasAnswerId) {
        prevAnswer = await this.answerService.getAnswerById(body.answerId);
      }
      questionData = await this.questionService.getQuestionDataById(prevAnswer?.questionId?.toString()||body.questionId);

      // If editing an already-finalized answer on a closed question, log as EDIT_FINAL_ANSWER.
      const isEditFinal =
        questionData?.status === 'closed' &&
        prevAnswer?.isFinalAnswer === true;
      if (isEditFinal) {
        auditPayload = {...auditPayload, action: AuditAction.EDIT_FINAL_ANSWER};
      }

      result = await this.answerService.approveAnswer(
        userId.toString(),
        body,
      );
      auditPayload={
        ...auditPayload,
        context: {
          ...auditPayload.context,
          questionId: prevAnswer?.questionId?.toString() || body.questionId,
          question: questionData?.question,
        },
        changes:{
          before: {
            answer: prevAnswer?.answer || ''
          },
          after:{}
        },
      };
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        changes: {
          before: {
            answer: prevAnswer?.answer || ''
          },
        },
        context: {
          ...auditPayload.context,
          questionId: prevAnswer?.questionId?.toString() || body.questionId,
          question: questionData?.question,
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to approve answer',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if(err instanceof InternalServerError){
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to approve answer',
      );
    }
    auditPayload = {
      ...auditPayload,
      changes: {
          ...auditPayload.changes,
          after: {
            answer: body.answer          
          },
      }
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result;
  }

  @OpenAPI({ summary: 'Moderator approve answer (Ajrasakha and WhatsApp)' })
  @Post('/moderator/approve')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, { statusCode: 400 })
  async approveLLMAnswer(
    @Body() body: UpdateAnswerBody,
    @CurrentUser() user: IUser,
  ) {
    verifyNotTester(user);
    const {_id: userId} = user;
    let result;
    let questionData;
    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ANSWER,
      action: AuditAction.PUSH_TO_GDB,
      actor: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        questionId: body.questionId,
      },
      changes: {},
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      questionData = await this.questionService.getQuestionDataById(body.questionId!);
      result = await this.answerService.approveLLMAnswer(
        userId.toString(),
        body,
      );
      auditPayload = {
        ...auditPayload,
        context: {
          ...auditPayload.context,
          question: questionData?.question,
        },
        changes: {
          before: {
            answer: '', // 1
          },
          after: {
            answer: body.answer,
          },
        },
      };
    } catch (err: any) {
      auditPayload = {
        ...auditPayload,
        context: {
          ...auditPayload.context,
          question: questionData?.question,
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to approve answer',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if (err instanceof InternalServerError) {
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(err?.message || 'Failed to approve answer');
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result;
  }


  @OpenAPI({summary: 'Delete an answer and update the related question state'})
  @Delete('/:questionId/:answerId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async deleteAnswer(@Params() params: DeleteAnswerParams, @CurrentUser() user: IUser) {
    verifyNotTester(user);
    const {answerId, questionId} = params;
    const auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ANSWER,
      action: AuditAction.DELETE_ANSWER,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: { questionId, answerId },
      createdAt: new Date(),
    };
    try {
      const result = await this.answerService.deleteAnswer(questionId, answerId);
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
          errorMessage: err?.message || 'Failed to delete answer',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      });
      throw err;
    }
  }

  @Get('/faqs/mod')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(SubmissionResponse, {isArray: true})
  @OpenAPI({summary: 'Get all FinalizedAnswers'})
  async getGoldenFaqs(
    @QueryParams() query: {page:number,limit:number,search:string,userId?:string},
    @CurrentUser() user: IUser,
  ): Promise<{faqs:any[];totalFaqs:number
  }>  {
    let {page=1,limit=10,search,userId} = query
    if(!userId){
      userId = user._id.toString()
    }
    return await this.answerService.goldenFaq(userId,Number(page),Number(limit),search)
  }

}
