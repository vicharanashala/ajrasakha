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
  InternalServerError,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {plainToInstance} from 'class-transformer';
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
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {
  ReRouteErrorResponseDto,
  ReRouteMessageResponseDto,
  RerouteHistoryEntryDto,
  AllocatedQuestionDto,
  QuestionDetailedResponseDto,
} from '../dtos/ReRouteResponseDto.js';
import { UserService } from '#root/modules/user/index.js';

@OpenAPI({
  tags: ['reroute'],
  description: 'Operations for managing questions',
})
@injectable()
@JsonController('/reroute')
export class ReRouteController {
  constructor(
    @inject(ROUTE_TYPES.ReRouteService)
    private readonly reRouteService: IReRouteService,

    @inject(GLOBAL_TYPES.UserService)
    private readonly userSevice: UserService,

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
  @ResponseSchema(ReRouteMessageResponseDto, {
    statusCode: 200,
    description: 'Expert allocated successfully - Returns success message',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 400,
    description: 'Bad request - Answer already rerouted or invalid parameters',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 404,
    description: 'Not found - Expert not found',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
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
  ): Promise<ReRouteMessageResponseDto> {
    const {_id: userId} = user;
    const {questionId} = params;
    const {expertId,answerId,moderatorId,comment,status} = body;
    const expertDetails = await this.userSevice.getUserById(expertId);
    let auditPayload : ModeratorAuditTrail= {
      category: AuditCategory.ANSWER,
      action: AuditAction.REROUTE_ANSWER,
      actor: {
        id: userId.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
        },
      context: {
        questionId: questionId,
        answerId: answerId,
        comment: comment,
        },
      changes:{
        after:{
          expertDetails: {
            name: `${expertDetails?.firstName} ${expertDetails?.lastName || ''}`.trim(),
            email: expertDetails?.email,
            role: expertDetails?.role,
          }
        }
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try{
      await this.reRouteService.addrerouteAnswer(questionId,expertId,answerId,moderatorId,comment,status as RerouteStatus)
    } catch(err:any){
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to allocate expert',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
       if(err instanceof InternalServerError){
         throw new InternalServerError(err.message);
       }
       throw new BadRequestError(
        err?.message || 'Failed to allocate expert',
      );
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    return plainToInstance(ReRouteMessageResponseDto, {message: 'Re routed successfully'});
  }
  @OpenAPI({
    summary: 'Get all re-routed allocated',
    description: 'Retrieves all re-routed questions allocated to the current expert with filtering options.',
  })
  @ResponseSchema(AllocatedQuestionDto, {
    statusCode: 200,
    description: 'Allocated questions retrieved successfully',
    isArray: true,
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 404,
    description: 'Not found - Expert not found',
  })
  @Post('/allocated')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(AllocatedQuestionDto, { isArray: true })
  async getAllocatedQuestions(
    @QueryParams()
    query: GetDetailedQuestionsQuery,
    @Body() body: AllocatedQuestionsBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<AllocatedQuestionDto[]> {
    const userId = user._id.toString();
    const questions = await this.reRouteService.getAllocatedQuestions(userId, query, body);
    return plainToInstance(AllocatedQuestionDto, questions, { excludeExtraneousValues: true });
  }

  @OpenAPI({
    summary: 'Get selected question by ID',
    description: 'Retrieves a re-routed question by ID including its details and reroute history.',
  })
  @ResponseSchema(QuestionDetailedResponseDto, {
    statusCode: 200,
    description: 'Question retrieved successfully with reroute history',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 404,
    description: 'Not found - Question not found',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
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
  ): Promise<QuestionDetailedResponseDto> {
    const {questionId} = params;
    const userId = user._id.toString();
   
    const result = await this.reRouteService.getQuestionById(questionId, userId);
    return plainToInstance(QuestionDetailedResponseDto, result);
  }



  @OpenAPI({
    summary: 'Expert can reject the re-route request',
    description: 'Allows an expert to reject a re-route request. Updates reputation score and sends notification to moderator.',
  })
  @ResponseSchema(ReRouteMessageResponseDto, {
    statusCode: 200,
    description: 'Request rejected successfully - Returns success message',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 400,
    description: 'Bad request - Request already rejected or in invalid state',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
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
  ): Promise<ReRouteMessageResponseDto> {
   // const expertId = user._id.toString();
    const {rerouteId,questionId} = params;
    const {reason,moderatorId,role,expertId} = body
    const userId = user._id.toString();
    const expertDetails = await this.userSevice.getUserById(expertId);
    let auditPayload : ModeratorAuditTrail= {
      category: AuditCategory.ANSWER,
      action: AuditAction.REROUTE_REJECTION,
      actor: {
        id: userId.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
        },
      context: {
        questionId: questionId,
        comment: reason,
        },
      changes:{
        before:{
          expertDetails: {
            name: `${expertDetails?.firstName} ${expertDetails?.lastName || ''}`.trim(),
            email: expertDetails?.email,
            role: expertDetails?.role,
          }
        }
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      }
    };
    try{
      await this.reRouteService.rejectRerouteRequest(rerouteId,questionId,expertId,moderatorId,reason,role)
    } catch(err:any){
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to reject re-route request',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
       if(err instanceof InternalServerError){
         throw new InternalServerError(err.message);
       }
        throw new BadRequestError(
        err?.message || 'Failed to reject re-route request',
      );
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    return plainToInstance(ReRouteMessageResponseDto, {message: 'Rejected the request successfully'});
  }

  @OpenAPI({
    summary: 'Get reroute history for an answer',
    description: 'Retrieves the complete reroute history for a specific answer including all reroute entries.',
  })
  @ResponseSchema(RerouteHistoryEntryDto, {
    statusCode: 200,
    description: 'Reroute history retrieved successfully',
    isArray: true,
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/:answerId/history')
  @HttpCode(200)
  @Authorized()
  @ResponseSchema(RerouteHistoryEntryDto, { isArray: true })
  async getRerouteHistory(
    @Params() params: {answerId:string},
  ): Promise<RerouteHistoryEntryDto[]> {
    const {answerId} = params;
    const history = await this.reRouteService.getRerouteHistory(answerId);
    return plainToInstance(RerouteHistoryEntryDto, history, { excludeExtraneousValues: true });
  }


  @OpenAPI({
    summary: 'Moderator can reject the re-route request',
    description: 'Allows a moderator to reject a re-route request for a specific expert. Updates the reroute status.',
  })
  @ResponseSchema(ReRouteMessageResponseDto, {
    statusCode: 200,
    description: 'Request rejected successfully by moderator - Returns success message',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 400,
    description: 'Bad request - Invalid status or parameters',
  })
  @ResponseSchema(ReRouteErrorResponseDto, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Patch('/:questionId/:expertId/action')
  @HttpCode(200)
  @Authorized()
  async moderatorRejected(
    @Params() params: ModeratorRejectParam,
    @Body() body: {status:RerouteStatus,reason:string},
  ): Promise<ReRouteMessageResponseDto> {
    const {questionId,expertId} = params;
    const {status,reason} = body
    await this.reRouteService.moderatorReject(questionId.toString(),expertId.toString(),status,reason)
    return plainToInstance(ReRouteMessageResponseDto, {message: 'Rejected the request successfully'});
  }
}