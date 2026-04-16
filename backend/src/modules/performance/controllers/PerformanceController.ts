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
import {
  PerformanceErrorResponse,
  WorkloadResponse,
  ReviewerHeatmapResponse,
  CheckInResponse,
  CronSnapshotReportResponse,
  LevelReportErrorResponse,
} from '../classes/validators/PerformanceResponseValidators.js';


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

  @OpenAPI({
    summary: 'Get dashboard analytics',
    description: 'Retrieves comprehensive dashboard analytics including user role overview, golden dataset, expert performance, and question/answer analytics. Requires moderator or admin role.',
  })
  @ResponseSchema(DashboardResponse, {
    statusCode: 200,
    description: 'Dashboard analytics retrieved successfully',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid query parameters',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only moderators and admins can access dashboard data',
  })
  @Get('/dashboard')
  @HttpCode(200)
  @Authorized()
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

  @OpenAPI({
    summary: 'Get HeatMap of Reviewers',
    description: 'Retrieves heatmap data showing review activity for reviewers within a specified date range.',
  })
  @ResponseSchema(ReviewerHeatmapResponse, {
    statusCode: 200,
    description: 'Reviewer heatmap data retrieved successfully',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 400,
    description: 'Bad request - Invalid query parameters',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/heatMapofReviewers')
  @HttpCode(200)
  @Authorized()
  async getHeatMapresults(
    @QueryParams() query: GetHeatMapQuery,
  ): Promise<IReviewerHeatmapResponse | null> {
    
    const result = await this.performanceService.getHeatMapresults(query);

    return result;
  }

  @OpenAPI({
    summary: 'Get workload count of User',
    description: 'Retrieves the current workload statistics for the authenticated user including their answer count and question counts.',
  })
  @ResponseSchema(WorkloadResponse, {
    statusCode: 200,
    description: 'Workload data retrieved successfully',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/workload')
  @HttpCode(200)
  @Authorized()
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

  // ─── GET LEVEL WISE REPORT ────────────────────────────────────────────

  @OpenAPI({
    summary: 'Get level wise report',
    description: 'Generates an Excel report showing level-wise review statistics (approved, rejected, modified counts) for the specified date range. Returns binary Excel data or JSON error response.',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 400,
    description: 'Bad request - startDate and endDate are required',
  })
  @ResponseSchema(LevelReportErrorResponse, {
    statusCode: 200,
    description: 'No data found for the selected filters',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Get('/level-report')
  @HttpCode(200)
  @Authorized()
  @ContentType(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
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

  @OpenAPI({
    summary: 'Check-in for the current user',
    description: 'Records a check-in timestamp for the current user.',
  })
  @ResponseSchema(CheckInResponse, {
    statusCode: 200,
    description: 'Check-in recorded successfully',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @Post('/check-in')
  @HttpCode(200)
  @Authorized()
  async checkIn(@CurrentUser() user: IUser) {
    await this.performanceService.updateCheckInTime(user._id.toString(), new Date());
    return { success: true, lastCheckInAt: new Date() };
  }

  @OpenAPI({
    summary: 'Send cron snapshot report via email',
    description: 'Sends a cron snapshot report via email to the admin user. Only admins can perform this action.',
  })
  @ResponseSchema(CronSnapshotReportResponse, {
    statusCode: 200,
    description: 'Cron snapshot report email sent successfully',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 403,
    description: 'Forbidden - Only admins can send cron snapshot reports',
  })
  @ResponseSchema(PerformanceErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to send email',
  })
  @Post("/cron-snapshot/send-report")
  @HttpCode(200)
  @Authorized()
  async sendCronSnapshotReport(@CurrentUser() user: IUser) {
    await this.performanceService.sendCronSnapshotEmail(
      user._id.toString(),
    );

    return {
      message: "Cron snapshot report email sent successfully.",
    };
  }


}
