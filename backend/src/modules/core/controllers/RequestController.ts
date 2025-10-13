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
import {RequestService} from '../services/RequestService.js';

@OpenAPI({
  tags: ['requests'],
  description: 'Operations for managing requests',
})
@injectable()
@JsonController('/requests')
export class RequestController {
  constructor(
    @inject(GLOBAL_TYPES.RequestService)
    private readonly requestService: RequestService,
  ) {}

  @Post('/')
  @HttpCode(201)
  @Authorized()
  @OpenAPI({summary: 'Create a new request'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async create(
    @Body() body: CreateRequestBodyDto,
    @CurrentUser() user: IUser,
  ): Promise<IRequest> {
    const userId = user._id.toString();
    return this.requestService.createRequest(body, userId);
  }

  @Get('/')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get all requests'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getAll(
    @CurrentUser() user: IUser,
    @QueryParams() query: GetAllRequestsQueryDto,
  ): Promise<{
    requests: (IRequest & {userName: string})[];
    totalPages: number;
    totalCount: number;
  }> {
    const userId = user._id.toString();
    return this.requestService.getAllRequests(userId, query);
  }
  @Get('/:requestId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get request difference by ID'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
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

  @Put('/:requestId/status')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Update request status'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async updateStatus(
    @Params() params: RequestParamsDto,
    @Body() body: RequestStatusBody,
    @CurrentUser() user: IUser,
  ): Promise<IRequestResponse> {
    const {requestId} = params;
    const {status, response} = body;
    const userId = user._id.toString();

    return this.requestService.updateStatus(requestId, status, response, userId);
  }
}
