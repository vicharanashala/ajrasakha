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
  GetDetailedQuestionsQuery,
  AllocatedQuestionsBodyDto,
} from '../classes/validators/QuestionValidators.js';
import {UploadFileOptions} from '../classes/validators/fileUploadOptions.js';
import * as XLSX from 'xlsx';
import {
  getBackgroundJobs,
  getJobById,
  startBackgroundProcessing,
} from '#root/workers/workerManager.js';
import { ROUTE_TYPES } from '../types.js';
import { ModeratorRejectParam, RerouteIdParam } from '../classes/validators/RerouteValidator.js';
import { IReRouteService } from '../interfaces/IRerouteService.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { AuditAction, AuditCategory, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {
  ReRouteErrorResponse,
  ReRouteSuccessResponse,
  RejectRequestResponse,
  RerouteHistoryArrayResponse,
  AllocatedQuestionsArrayResponse,
  QuestionByIdResponse,
} from '../classes/validators/ReRouteResponseValidators.js';

@OpenAPI({
  tags: ['reroute'],
  description: 'Operations for managing questions',
})
@injectable()
@JsonController('/reroute',{ transformResponse: false })
export class ReRouteController {
  constructor(
    @inject(ROUTE_TYPES.ReRouteService)
    private readonly reRouteService: IReRouteService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
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

  @OpenAPI({
    summary: 'Manually allocate experts to a selected question',
    description: 'Assigns a re-routed expert to review an answer for a specific question. Sends notification to the assigned expert.',
  })
  @ResponseSchema(ReRouteSuccessResponse, {
    statusCode: 200,
    description: 'Expert allocated successfully - Returns success message',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Answer already rerouted or invalid parameters',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 404,
    description: 'Not found - Expert not found',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to allocate expert',
  })
  @Post('/:questionId/allocate-reroute-experts')
  @HttpCode(200)
  @Authorized()
  async allocateExperts(
    @Params() params: QuestionIdParam,
    @Body() body: AllocateReRouteExpertsRequest,
    @CurrentUser() user: IUser,
  ):Promise<{message:string}> {
    const {_id: userId} = user;
    const {questionId} = params;
    const {expertId,answerId,moderatorId,comment,status} = body;
    let auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.REROUTE_ANSWER,
      actor: {
        id: userId.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        },
      context: {
        questionId: questionId,
        answerId: answerId,
        comment: comment,
        },
      changes:{
        after:{
          experts: Array(expertId),
        }
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    await this.reRouteService.addrerouteAnswer(questionId,expertId,answerId,moderatorId,comment,status as RerouteStatus)
    this.auditTrailsService.createAuditTrail(auditPayload);
    return {message:"Re routed succesfully"}
  }
  @OpenAPI({
    summary: 'Get all re-routed allocated',
    description: 'Retrieves all re-routed questions allocated to the current expert with filtering options.',
  })
  @ResponseSchema(AllocatedQuestionsArrayResponse, {
    statusCode: 200,
    description: 'Allocated questions retrieved successfully',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 404,
    description: 'Not found - Expert not found',
  })
  @Post('/allocated')
  @HttpCode(200)
  @Authorized()
  async getAllocatedQuestions(
    @QueryParams()
    query: GetDetailedQuestionsQuery,
    @Body() body: AllocatedQuestionsBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<any[]> {
    const userId = user._id.toString();
    return this.reRouteService.getAllocatedQuestions(userId, query, body);
  }

  @OpenAPI({
    summary: 'Get selected question by ID',
    description: 'Retrieves a re-routed question by ID including its details and reroute history.',
  })
  @ResponseSchema(QuestionByIdResponse, {
    statusCode: 200,
    description: 'Question retrieved successfully with reroute history',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 404,
    description: 'Not found - Question not found',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch question',
  })
  @Get('/:questionId')
  @HttpCode(200)
  @Authorized()
  async getQuestionById(
    @Params() params: QuestionIdParam,
    @Body() updates: any,
    @CurrentUser() user: IUser
  ): Promise<any> {
    const {questionId,actionType} = params;
    const userId = user._id.toString();
   // return null
   
    return this.reRouteService.getQuestionById(questionId,userId);
  }



  @OpenAPI({
    summary: 'Expert can reject the re-route request',
    description: 'Allows an expert to reject a re-route request. Updates reputation score and sends notification to moderator.',
  })
  @ResponseSchema(RejectRequestResponse, {
    statusCode: 200,
    description: 'Request rejected successfully - Returns success message',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Request already rejected or in invalid state',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Patch('/:rerouteId/:questionId')
  @HttpCode(200)
  @Authorized()
  async expertRejected(
    @Params() params: RerouteIdParam,
    @Body() body: {reason:string,moderatorId:string,role:string,expertId:string},
    @CurrentUser() user: IUser,
  ):Promise<{message:string}> {
   // const expertId = user._id.toString();
    const {rerouteId,questionId} = params;
    const {reason,moderatorId,role,expertId} = body
    const userId = user._id.toString();
    let auditPayload = {
      category: AuditCategory.ANSWER,
      action: AuditAction.REROUTE_REJECTION,
      actor: {
        id: userId.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        },
      context: {
        questionId: questionId,
        comment: reason,
        },
      changes:{
        before:{
          experts: Array(expertId),
        }
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      }
    };
    await this.reRouteService.rejectRerouteRequest(rerouteId,questionId,expertId,moderatorId,reason,role)
    this.auditTrailsService.createAuditTrail(auditPayload);
    return {message:"Rejected the request succesfully"}
  }

  @OpenAPI({
    summary: 'Get reroute history for an answer',
    description: 'Retrieves the complete reroute history for a specific answer including all reroute entries.',
  })
  @ResponseSchema(RerouteHistoryArrayResponse, {
    statusCode: 200,
    description: 'Reroute history retrieved successfully',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/:answerId/history')
  @HttpCode(200)
  @Authorized()
  async getRerouteHistory(
    @Params() params: {answerId:string},
  ){
    
    const {answerId} =params
    return await this.reRouteService.getRerouteHistory(answerId)
  }


  @OpenAPI({
    summary: 'Moderator can reject the re-route request',
    description: 'Allows a moderator to reject a re-route request for a specific expert. Updates the reroute status.',
  })
  @ResponseSchema(RejectRequestResponse, {
    statusCode: 200,
    description: 'Request rejected successfully by moderator - Returns success message',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid status or parameters',
  })
  @ResponseSchema(ReRouteErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Patch('/:questionId/:expertId/action')
  @HttpCode(200)
  @Authorized()
  async moderatorRejected(
    @Params() params: ModeratorRejectParam,
    @Body() body: {status:RerouteStatus,reason:string},
  ):Promise<{message:string}> {
    const {questionId,expertId} = params;
    const {status,reason} = body
    await this.reRouteService.moderatorReject(questionId.toString(),expertId.toString(),status,reason)
    return {message:"Rejected the request succesfully"}
  }
}