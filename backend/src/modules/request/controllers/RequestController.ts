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
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {
  CreateRequestBodyDto,
  GetAllRequestsQueryDto,
  RequestParamsDto,
  RequestStatusBody,
} from '../classes/validators/RequestValidators.js';
import { RequestService } from '../services/RequestService.js';
import { IRequestService } from '../interfaces/IRequestService.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { AuditAction, AuditCategory, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {
  RequestErrorResponse,
  RequestCreateResponse,
  PaginatedRequestsResponse,
  RequestDiffResponse,
  RequestStatusUpdateResponse,
} from '../classes/validators/RequestResponseValidators.js';

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
  @ResponseSchema(RequestCreateResponse, {
    statusCode: 201,
    description: 'Request created successfully - Returns the created request',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid request data',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to create request',
  })
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async create(
    @Body() body: CreateRequestBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<IRequest> {
    const userId = user._id.toString();
    return this.requestService.createRequest(body, userId);
  }

  @OpenAPI({
    summary: 'Get all requests',
    description: 'Retrieves paginated list of all requests with optional filtering by status and request type. Only moderators and admins can access this.',
  })
  @ResponseSchema(PaginatedRequestsResponse, {
    statusCode: 200,
    description: 'Requests retrieved successfully with pagination',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only moderators and admins can view all requests',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch requests',
  })
  @Get('/')
  @HttpCode(200)
  @Authorized()
  async getAll(
    @CurrentUser() user: IUser,
    @QueryParams() query: GetAllRequestsQueryDto,
  ): Promise<{
    requests: IRequest[];
    totalPages: number;
    totalCount: number;
  }> {
    const userId = user._id.toString();
    return this.requestService.getAllRequests(userId, query);
  }
  @OpenAPI({
    summary: 'Get request difference by ID',
    description: 'Retrieves the diff view showing current document, existing document, and all responses for a specific request.',
  })
  @ResponseSchema(RequestDiffResponse, {
    statusCode: 200,
    description: 'Request diff retrieved successfully',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 404,
    description: 'Not found - Request not found',
  })
  @Get('/:requestId')
  @HttpCode(200)
  @Authorized()
  async getRequestDiff(
    @Params() params: RequestParamsDto,
    @CurrentUser() user: IUser,
  ): Promise<{
    currentDoc: any;
    existingDoc: any;
    responses: IRequestResponse[]
  }> {
    const {requestId} = params;
    const userId = user._id.toString();
    return this.requestService.getRequestDiff(userId, requestId);
  }

  @OpenAPI({
    summary: 'Update request status',
    description: 'Updates the status of a request (pending, approved, rejected, in-review) and adds a response. If approved, applies the requested changes to the entity.',
  })
  @ResponseSchema(RequestStatusUpdateResponse, {
    statusCode: 200,
    description: 'Request status updated successfully - Returns the response entry',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid status or request already closed',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(RequestErrorResponse, {
    statusCode: 404,
    description: 'Not found - Request not found',
  })
  @Put('/:requestId/status')
  @HttpCode(200)
  @Authorized()
  async updateStatus(
    @Params() params: RequestParamsDto,
    @Body() body: RequestStatusBody,
    @CurrentUser() user: IUser,
  ): Promise<IRequestResponse> {
    const {requestId} = params;
    const {status, response} = body;
    const userId = user._id.toString();
    let auditPayload = {
      category: AuditCategory.REQUEST_QUEUE,
      action: AuditAction.CHANGE_STATUS,
      actor: {
        id: userId,
        name: `${user.firstName} ${user.lastName || ''}`.trim(),
        email: user.email,
        role: user.role,
      },
      context: {
        requestId,
        response
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
    const result = await this.requestService.updateStatus(requestId, status, response, userId);
    this.auditTrailsService.createAuditTrail(auditPayload);
    return result;
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
    let payload = {
      category: AuditCategory.REQUEST_QUEUE,
      action: AuditAction.DELETE_REQUEST,
      actor: {
        id: userId,
        name: `${user.firstName} ${user.lastName || ''}`.trim(),
        email: user.email,
        role: user.role,
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
    this.auditTrailsService.createAuditTrail(payload);
    await this.requestService.softDeleteRequest(requestId, userId);
  }
}
