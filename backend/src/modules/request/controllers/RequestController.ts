import {BadRequestErrorResponse, IRequest, IRequestResponse, IUser} from '#root/shared/index.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {inject, injectable} from 'inversify';
import {
  JsonController,
  Post,
  Get,
  Put,
  Body,
  Params,
  HttpCode,
  Authorized,
  CurrentUser,
  QueryParams,
  InternalServerError,
  BadRequestError,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
  RequestParamsDto,
  UpdateRequestStatusDto,
  RequestErrorResponse,
} from '../classes/validators/RequestValidators.js';
import {
  RequestDto,
  PaginatedRequestsResponseDto,
  RequestDiffResponseDto,
  RequestResponseDto,
} from '../dtos/RequestResponseDto.js';
import { RequestService } from '../services/RequestService.js';
import { IRequestService } from '../interfaces/IRequestService.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import { plainToInstance, instanceToPlain } from 'class-transformer';

@OpenAPI({
  tags: ['requests'],
  description: 'Operations for managing requests',
})
@injectable()
@JsonController('/requests')
export class RequestController {
  constructor(
    @inject(GLOBAL_TYPES.RequestService)
    private readonly requestService: IRequestService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @OpenAPI({
    summary: 'Create a new request',
    description: 'Creates a new flag request for a question or other entity. Notifications are sent to all moderators.',
  })
  @ResponseSchema(RequestDto, {
    statusCode: 201,
    description: 'Request created successfully - Returns the created request',
  })
  @ResponseSchema(BadRequestErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid request data',
  })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async create(
    @Body() body: CreateRequestBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<RequestDto> {
    const userId = user._id.toString();
    const result = await this.requestService.createRequest(body, userId);
    const instance = plainToInstance(RequestDto, result, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({
    summary: 'Get all requests',
    description: 'Retrieves paginated list of all requests with optional filtering by status and request type. Only moderators and admins can access this.',
  })
  @ResponseSchema(PaginatedRequestsResponseDto, {
    statusCode: 200,
    description: 'Requests retrieved successfully with pagination',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getAll(
    @CurrentUser() user: IUser,
    @QueryParams() query: GetAllRequestsQueryDto,
  ): Promise<PaginatedRequestsResponseDto> {
    const userId = user._id.toString();
    const result = await this.requestService.getAllRequests(userId, query);
    const instance = plainToInstance(PaginatedRequestsResponseDto, result, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }
  @OpenAPI({
    summary: 'Get request difference by ID',
    description: 'Retrieves the diff view showing current document, existing document, and all responses for a specific request.',
  })
  @ResponseSchema(RequestDiffResponseDto, {
    statusCode: 200,
    description: 'Request diff retrieved successfully',
  })
  @Get('/:requestId')
  @HttpCode(200)
  @Authorized()
  async getRequestDiff(
    @Params() params: RequestParamsDto,
    @CurrentUser() user: IUser,
  ): Promise<RequestDiffResponseDto> {
    const {requestId} = params;
    const userId = user._id.toString();
    const result = await this.requestService.getRequestDiff(userId, requestId);
    const instance = plainToInstance(RequestDiffResponseDto, result, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({
    summary: 'Update request status',
    description: 'Updates the status of a request (pending, approved, rejected, in-review) and adds a response. If approved, applies the requested changes to the entity.',
  })
  @ResponseSchema(RequestResponseDto, {
    statusCode: 200,
    description: 'Request status updated successfully - Returns the response entry',
  })
  @Put('/:requestId/status')
  @HttpCode(200)
  @Authorized()
  async updateStatus(
    @Params() params: RequestParamsDto,
    @Body() body: UpdateRequestStatusDto,
    @CurrentUser() user: IUser,
  ): Promise<RequestResponseDto> {
    const {requestId} = params;
    const {status, response} = body;
    const userId = user._id.toString();
    let result;
    let auditPayload : ModeratorAuditTrail = {
      category: AuditCategory.REQUEST_QUEUE,
      action: AuditAction.CHANGE_STATUS,
      actor: {
        id: userId,
        name: `${user.firstName} ${user.lastName || ''}`.trim(),
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        requestId,
        reason: response
      },
      changes: {
        before: {
          status: (await this.requestService.getRequestStatusById(requestId)),
        },
        after: {
          status,
        },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try {
      result = await this.requestService.updateStatus(requestId, status, response, userId);
    } catch(err: any){
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to update request status',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      this.auditTrailsService.createAuditTrail(auditPayload);
      if(err instanceof InternalServerError){
         throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to update request status',
      );
    }
    this.auditTrailsService.createAuditTrail(auditPayload);
    const instance = plainToInstance(RequestResponseDto, result, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({
    summary: 'Soft delete a request',
    description: 'Soft deletes a request by marking it as deleted. Only moderators can perform this action.',
  })
  @ResponseSchema(undefined, {
    statusCode: 204,
    description: 'Request deleted successfully - Returns no content',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only moderators can delete requests',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 404,
    description: 'Not found - Request not found',
  })
  @Put('/:requestId/delete')
  @HttpCode(204)
  @Authorized()
  async softDelete(
    @Params() params: RequestParamsDto,
    @CurrentUser() user: IUser,
  ): Promise<void> {
  const {requestId} = params;
    const userId = user._id.toString();
    let previousRequest;
    let auditPayload : ModeratorAuditTrail= {
      category: AuditCategory.REQUEST_QUEUE,
      action: AuditAction.DELETE_REQUEST,
      actor: {
        id: userId,
        name: `${user.firstName} ${user.lastName || ''}`.trim(),
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        requestId,
      },
      changes: {
        before: {
          status: (await this.requestService.getRequestStatusById(requestId)),
        },
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };
    try{
      previousRequest = await this.requestService.getRequestById(requestId);
      await this.requestService.softDeleteRequest(requestId, userId);
    } catch(err: any){
      auditPayload = {
        ...auditPayload,
        context: {
          ...auditPayload.context,
          reason: previousRequest?.reason,
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to delete request',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      }
        this.auditTrailsService.createAuditTrail(auditPayload);
        if(err instanceof InternalServerError){
          throw new InternalServerError(err.message);
        }
        throw new BadRequestError(
          err?.message || 'Failed to delete request',
        );
    }
    auditPayload = {
      ...auditPayload,
      context: {
        ...auditPayload.context,
        reason: previousRequest?.reason,
      },
    };
    this.auditTrailsService.createAuditTrail(auditPayload);
  }
}
