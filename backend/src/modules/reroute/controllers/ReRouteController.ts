import 'reflect-metadata';
import {
  JsonController,
  Get,
  Put,
  Delete,
  Body,
  HttpCode,
  Params,
  QueryParams,
  Authorized,
  CurrentUser,
  Post,
  Param,
  NotFoundError,
  Patch,
  UploadedFile,
  BadRequestError,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {
  IQuestion,
  IQuestionSubmission,
  IUser,
  RerouteStatus,
} from '#root/shared/interfaces/models.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';

import {ReRouteService} from '../services/ReRouteService.js'
import {ContextIdParam} from '../classes/validators/ContextValidators.js';
import {
  
  QuestionIdParam,
  AllocateReRouteExpertsRequest,
  QuestionResponse,
  GetDetailedQuestionsQuery
  
  
} from '../classes/validators/QuestionValidators.js';
import {UploadFileOptions} from '../classes/validators/fileUploadOptions.js';
import * as XLSX from 'xlsx';
import {
  getBackgroundJobs,
  getJobById,
  startBackgroundProcessing,
} from '#root/workers/workerManager.js';
import { ROUTE_TYPES } from '../types.js';
import { RerouteIdParam } from '../classes/validators/RerouteValidator.js';

@OpenAPI({
  tags: ['reroute'],
  description: 'Operations for managing questions',
})
@injectable()
@JsonController('/reroute',{ transformResponse: false })
export class ReRouteController {
  constructor(
    @inject(ROUTE_TYPES.ReRouteService)
    private readonly reRouteService: ReRouteService,
  ) {}

  // @Get('/allocat')
  // @HttpCode(200)
  // @Authorized()
  // @OpenAPI({summary: 'Get questions by context ID'})
  // @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  // async getByContextId(@Params() params: ContextIdParam): Promise<any> {
  //   const {contextId} = params;
  //   console.log("the reroute calling====",)
  //   return this.reRouteService.addrerouteAnswer();
  // }

  @Post('/:questionId/allocate-reroute-experts')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Manually allocate experts to a selected question'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async allocateExperts(
    @Params() params: QuestionIdParam,
    @Body() body: AllocateReRouteExpertsRequest,
    @CurrentUser() user: IUser,
  ):Promise<{message:string}> {
    const {_id: userId} = user;
    const {questionId} = params;
    const {expertId,answerId,moderatorId,comment,status} = body;
    await this.reRouteService.addrerouteAnswer(questionId,expertId,answerId,moderatorId,comment,status as RerouteStatus)
    return {message:"Re routed succesfully"}
  }
  @Get('/allocated')
  @HttpCode(200)
  // @ResponseSchema(QuestionResponse, {isArray: true})
  @Authorized()
  @OpenAPI({summary: 'Get all re-routed allocated'})
  async getAllocatedQuestions(
    @QueryParams()
    query: GetDetailedQuestionsQuery,
    @CurrentUser() user: IUser,
  ): Promise<any[]> {
    const userId = user._id.toString();
   return this.reRouteService.getAllocatedQuestions(userId,query);
  }

  @Get('/:questionId')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse)
  @OpenAPI({summary: 'Get selected question by ID'})
  async getQuestionById(
    @Params() params: QuestionIdParam,
    @Body() updates: Partial<QuestionResponse>,
  ): Promise<any[]> {
    const {questionId} = params;
    console.log("the question id coming====",questionId)
   // return null
    return this.reRouteService.getQuestionById(questionId);
  }



  @Patch('/:rerouteId/:questionId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Expert can reject the re-route request'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async expertRejected(
    @Params() params: RerouteIdParam,
    @Body() body: {reason:string,expertId:string,moderatorId:string},
    @CurrentUser() user: IUser,
  ):Promise<{message:string}> {
    const {rerouteId,questionId} = params;
    const {reason,expertId,moderatorId} = body
    await this.reRouteService.rejectRerouteRequest(rerouteId,questionId,expertId,moderatorId,reason)
    return {message:"Rejected the request succesfully"}
  }

  @Get('/:answerId/history')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(QuestionResponse)
  @OpenAPI({summary: 'Get selected question by ID'})
  async getRerouteHistory(
    @Params() params: {answerId:string},
  ){
    const {answerId} =params
    return await this.reRouteService.getRerouteHistory(answerId)
  }
}