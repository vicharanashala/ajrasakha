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
import {
  IAnswer,
  IUser,
  IReviewerHeatmapRow,
} from '#root/shared/interfaces/models.js';
import {PerformanceService} from '../services/PerformanceService.js';
import {
  DashboardResponse,
  GetDashboardQuery,
  GetHeatMapQuery,
} from '../classes/validators/DashboardValidators.js';

@OpenAPI({
  tags: ['performance'],
  description: 'Operations related to Performance Dashboard',
})
@JsonController('/performance')
export class PerformanceController {
  constructor(
    @inject(GLOBAL_TYPES.PerformanceService)
    private readonly performanceService: PerformanceService,
  ) {}

  @Get('/dashboard')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get dashboard analytics'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getDashboardData(
    @QueryParams() query: GetDashboardQuery,
    @CurrentUser() user: IUser,
  ): Promise<DashboardResponse> {
    const currentUserId = user._id.toString();
    const {data} = await this.performanceService.getDashboardData(
      currentUserId,
      query,
    );

    return data;
  }

  @Get('/heatMapofReviewers')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get HeatMap of Reviewers'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getHeatMapresults(
    @QueryParams() query: GetHeatMapQuery,
  ): Promise<IReviewerHeatmapRow[] | null> {
    const result = await this.performanceService.getHeatMapresults(query);

    return result;
  }

  @Get('/workload')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get workload count of User'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getWorkLoadCount(@CurrentUser() user: IUser): Promise<{
    currentUserAnswers: any[];
    totalQuestionsCount: number;
    totalInreviewQuestionsCount: number;
  }> {
    const currentUserId = user._id.toString();
    const result = await this.performanceService.getCurrentUserWorkLoad(
      currentUserId,
    );
    // console.log("the service result====",result)
    return result;
  }
}
