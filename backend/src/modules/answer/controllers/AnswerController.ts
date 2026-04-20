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
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {IAnswer, IUser} from '#root/shared/interfaces/models.js';
import { AnswerService } from '../services/AnswerService.js';
import { AddAnswerBody, AnswerIdParam, DeleteAnswerParams, ReviewAnswerBody, SubmissionResponse, UpdateAnswerBody } from '../classes/validators/AnswerValidator.js';
import { IAnswerService } from '../interfaces/IAnswerService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AuditAction, AuditCategory, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
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
    const {questionId, answer, sources} = body;
    const authorId = user._id.toString();
    return this.answerService.addAnswer(questionId, authorId, answer, sources);
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
    const userId = user._id.toString();
    if(body.type=="reroute")
    {
      return this.answerService.reRouteReviewAnswer(userId, body)
    }
    return this.answerService.reviewAnswer(userId, body);
  }

  @Get('/submissions')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(SubmissionResponse, {isArray: true})
  @OpenAPI({summary: 'Get all submissions'})
  async getUnAnsweredQuestions(
    @QueryParams() query: {page?: number; limit?: number; start:string | undefined,end:string | undefined,selectedHistoryId:string|undefined},
    @CurrentUser() user: IUser,
  ): Promise<SubmissionResponse[]> {
    const page = Number(query.page) ?? 1;
    const limit = Number(query.limit) ?? 10;
    const userId = user._id.toString();
    const selectedHistoryId=query.selectedHistoryId
    let dateRange=undefined
    if(query.start && query.end){
    let end = new Date(query.end as string);
    end.setHours(23,59,59,999)
    dateRange = {from:new Date(query.start as string),to:end}
    }
    return this.answerService.getSubmissions(userId, page, limit,dateRange,selectedHistoryId);
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
    const {_id: userId} = user;
    const prevAnswer = await this.answerService.getAnswerById(body.answerId);
    const questionData = await this.questionService.getQuestionById(prevAnswer.questionId.toString());
    let auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.APPROVE_ANSWER,
      actor: {
        id: userId,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        },
      context: {
        questionId: prevAnswer?.questionId.toString() || body.questionId,
        question: questionData.text,
        answerId: body.answerId,
      },
      changes:{
        before: {
          answer: prevAnswer?.answer || ''
        },
        after:{}
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    const result = await this.answerService.approveAnswer(
      userId.toString(),
      body,
    );
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


  @OpenAPI({summary: 'Delete an answer and update the related question state'})
  @Delete('/:questionId/:answerId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async deleteAnswer(@Params() params: DeleteAnswerParams) {
    const {answerId, questionId} = params;
    return this.answerService.deleteAnswer(questionId, answerId);
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
