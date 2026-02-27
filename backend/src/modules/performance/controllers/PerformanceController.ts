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
  Res,
  ContentType,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject} from 'inversify';
import {GLOBAL_TYPES} from '#root/types.js';
import {BadRequestErrorResponse} from '#shared/middleware/errorHandler.js';
import {
  IAnswer,
  IUser,
  IReviewerHeatmapResponse,
} from '#root/shared/interfaces/models.js';
import { PerformanceService } from '../services/PerformanceService.js';
import { DashboardResponse, GetDashboardQuery, GetHeatMapQuery } from '#root/modules/core/classes/validators/DashboardValidators.js';
import { IPerformanceService } from '../interfaces/IPerformanceService.js';


@OpenAPI({
  tags: ['performance'],
  description: 'Operations related to Performance Dashboard',
})
@JsonController('/performance')
export class PerformanceController {
  constructor(
    @inject(GLOBAL_TYPES.PerformanceService)
    private readonly performanceService: IPerformanceService,
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
  ): Promise<IReviewerHeatmapResponse | null> {
    
    const result = await this.performanceService.getHeatMapresults(query);

    return result;
  }

  @Get('/workload')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({summary: 'Get workload count of User'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getWorkLoadCount(@CurrentUser() user: IUser): Promise<{
    currentUserAnswersCount: number;
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

  //get level wise report based on the answers state
  @Get('/level-report')
  @HttpCode(200)
  @Authorized()
  @ContentType(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @OpenAPI({summary: 'Get level wise report'})
  @ResponseSchema(BadRequestErrorResponse, {statusCode: 400})
  async getLevelWiseReport(
    @QueryParams() query: {startDate: string; endDate: string},
    @Res() response: any,
  ) {
    const startDate = query.startDate;
    const endDate = query.endDate;
    if (!startDate || !endDate) {
      return response.status(400).json({
        success: false,
        message: 'startDate and endDate are required',
      });
    }
    const data = await this.performanceService.getLevelWiseReport(
      startDate,
      endDate,
    );
    if (!data) {
      response.status(200).json({
        success: false,
        message: 'No data found for the selected filters',
      });
      return;
    }

    return Buffer.from(data);
  }

  @Post('/check-in')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Check-in for the current user' })
  async checkIn(@CurrentUser() user: IUser) {
    await this.performanceService.updateCheckInTime(user._id.toString(), new Date());
    return { success: true, lastCheckInAt: new Date() };
  }

  @Post("/cron-snapshot/send-report")
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: "Send cron snapshot report via email" })
  async sendCronSnapshotReport(
    @CurrentUser() user: IUser,
  ) {
    await this.performanceService.sendCronSnapshotEmail(
      user._id.toString(),
    );

    return {
      message: "Cron snapshot report email sent successfully.",
    };
  }


}
