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

@OpenAPI({
  tags: ['reroute'],
  description: 'Operations for managing questions',
})
@injectable()
@JsonController('/reroute')
export class ReRouteController {
  constructor(
    @inject(GLOBAL_TYPES.QuestionService)
    private readonly reRouteService: ReRouteService,
  ) {}

  @Get('/allocat')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get questions by context ID'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getByContextId(@Params() params: ContextIdParam): Promise<any> {
    const {contextId} = params;
    console.log("the reroute calling====",)
    return this.reRouteService.addrerouteAnswer();
  }

  @Post('/:questionId/allocate-reroute-experts')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Manually allocate experts to a selected question'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async allocateExperts(
    @Params() params: QuestionIdParam,
    @Body() body: AllocateReRouteExpertsRequest,
    @CurrentUser() user: IUser,
  ) {
    const {_id: userId} = user;
    const {questionId} = params;
    const {expertId,answerId,moderatorId,comment,status} = body;
    console.log("the body coming====",body)
   /* return await this.questionService.allocateExperts(
      userId.toString(),
      questionId,
      experts,
    );*/
  }
  @Get('/allocated')
  @HttpCode(200)
  @ResponseSchema(QuestionResponse, {isArray: true})
  @Authorized()
  @OpenAPI({summary: 'Get all open status questions'})
  async getAllocatedQuestions(
    @QueryParams()
    query: GetDetailedQuestionsQuery,
    @CurrentUser() user: IUser,
  ): Promise<any> {
    const userId = user._id.toString();
    console.log("the reoute coming from allocation")
   // return this.reRouteService.getAllocatedQuestions(userId, query);
  }

}