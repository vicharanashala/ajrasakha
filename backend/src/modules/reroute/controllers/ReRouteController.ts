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
  AddQuestionBodyDto,
  AllocateExpertsRequest,
  GeneratedQuestionResponse,
  GenerateQuestionsBody,
  GetDetailedQuestionsQuery,
  QuestionIdParam,
  QuestionResponse,
  RemoveAllocateBody,
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

  @Post('/:questionId/allocate-experts')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Manually allocate experts to a selected question'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async allocateExperts(
    @Params() params: QuestionIdParam,
    @Body() body: any,
    @CurrentUser() user: IUser,
  ) {
    const {_id: userId} = user;
    const {questionId} = params;
    const {expertId} = body;
    console.log("the body coming====",body)
   /* return await this.questionService.allocateExperts(
      userId.toString(),
      questionId,
      experts,
    );*/
  }

}