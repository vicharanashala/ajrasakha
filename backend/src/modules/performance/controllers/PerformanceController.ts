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
  InternalServerError,
  BadRequestError,
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
import {
  DashboardResponse,
  GetDashboardQuery,
  GetHeatMapQuery,
  GetGoldenDatasetQuery,
  GetContributionTrendQuery,
  GetQuestionsAnalyticsQuery,
  UserRoleOverview,
  ModeratorApprovalRate,
  GoldenDataset,
  QuestionContributionTrend,
  StatusOverview,
  ExpertPerformance,
  Analytics
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import { DashboardResponseDto, OverviewResponseDto, GoldenDatasetDto, QuestionContributionTrendDto, StatusOverviewDto, ExpertPerformanceDto, AnalyticsDto } from '#root/modules/dashboard/dtos/DashboardResponseDto.js';
import { plainToInstance, instanceToPlain } from 'class-transformer';
import { IPerformanceService } from '../interfaces/IPerformanceService.js';
import {
  PerformanceErrorResponse,
  WorkloadResponse,
  ReviewerHeatmapResponse,
  CheckInResponse,
  CronSnapshotReportResponse,
  LevelReportErrorResponse,
} from '../classes/validators/PerformanceResponseValidators.js';
import {
  WorkloadResponseDto,
  ReviewerHeatmapResponseDto,
  CheckInResponseDto,
} from '../dtos/PerformanceResponseDto.js';
import { IAuditTrailsService } from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import { AUDIT_TRAILS_TYPES } from '#root/modules/auditTrails/types.js';
import { AuditAction, AuditCategory, ModeratorAuditTrail, OutComeStatus } from '#root/modules/auditTrails/interfaces/IAuditTrails.js';


@OpenAPI({
  tags: ['performance'],
  description: 'Operations related to Performance Dashboard',
})
@JsonController('/performance')
export class PerformanceController {
  constructor(
    @inject(GLOBAL_TYPES.PerformanceService)
    private readonly performanceService: IPerformanceService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  @OpenAPI({
    summary: 'Get dashboard analytics',
    description: 'Retrieves comprehensive dashboard analytics including user role overview, golden dataset, expert performance, and question/answer analytics. Requires moderator or admin role.',
  })
  @ResponseSchema(DashboardResponseDto, {
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
  ): Promise<DashboardResponseDto> {
    const currentUserId = user._id.toString();
    const {data} = await this.performanceService.getDashboardData(
      currentUserId,
      query,
    );

    const instance = plainToInstance(DashboardResponseDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({ summary: 'Get role overview and approval rates' })
  @Get('/overview')
  @Authorized()
  @ResponseSchema(OverviewResponseDto)
  async getOverview(@CurrentUser() user: IUser): Promise<OverviewResponseDto> {
    const data = await this.performanceService.getOverview(user._id.toString());
    const instance = plainToInstance(OverviewResponseDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({ summary: 'Get golden dataset analytics' })
  @Get('/golden-dataset')
  @Authorized()
  @ResponseSchema(GoldenDatasetDto)
  async getGoldenDataset(@QueryParams() query: GetGoldenDatasetQuery): Promise<GoldenDatasetDto> {
    const data = await this.performanceService.getGoldenDataset(query);
    const instance = plainToInstance(GoldenDatasetDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({ summary: 'Get question contribution trends' })
  @Get('/contribution-trend')
  @Authorized()
  @ResponseSchema(QuestionContributionTrendDto, { isArray: true })
  async getContributionTrend(@QueryParams() query: GetContributionTrendQuery): Promise<QuestionContributionTrendDto[]> {
    const data = await this.performanceService.getContributionTrend(query.timeRange);
    const instance = plainToInstance(QuestionContributionTrendDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({ summary: 'Get status overview' })
  @Get('/status-overview')
  @Authorized()
  @ResponseSchema(StatusOverviewDto)
  async getStatusOverview(): Promise<StatusOverviewDto> {
    const data = await this.performanceService.getStatusOverview();
    const instance = plainToInstance(StatusOverviewDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({ summary: 'Get expert performance metrics' })
  @Get('/expert-performance')
  @Authorized()
  @ResponseSchema(ExpertPerformanceDto, { isArray: true })
  async getExpertPerformance(): Promise<ExpertPerformanceDto[]> {
    const data = await this.performanceService.getExpertPerformance();
    const instance = plainToInstance(ExpertPerformanceDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
  }

  @OpenAPI({ summary: 'Get detailed questions/answers analytics' })
  @Get('/questions-analytics')
  @Authorized()
  @ResponseSchema(AnalyticsDto)
  async getQuestionsAnalytics(@QueryParams() query: GetQuestionsAnalyticsQuery): Promise<AnalyticsDto> {
    const data = await this.performanceService.getQuestionsAnalytics(query);
    const instance = plainToInstance(AnalyticsDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
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
  @ResponseSchema(ReviewerHeatmapResponseDto)
  async getHeatMapresults(
    @QueryParams() query: GetHeatMapQuery,
  ): Promise<ReviewerHeatmapResponseDto | null> {
    
    const result = await this.performanceService.getHeatMapresults(query);
    if (!result) return null;

    const instance = plainToInstance(ReviewerHeatmapResponseDto, result, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
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
  @ResponseSchema(WorkloadResponseDto)
  async getWorkLoadCount(@CurrentUser() user: IUser): Promise<WorkloadResponseDto> {
    const currentUserId = user._id.toString();
    const result = await this.performanceService.getCurrentUserWorkLoad(
      currentUserId,
    );
    const instance = plainToInstance(WorkloadResponseDto, result, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
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
  @ResponseSchema(CheckInResponseDto)
  async checkIn(@CurrentUser() user: IUser): Promise<CheckInResponseDto> {
    const checkInTime = new Date();
    await this.performanceService.updateCheckInTime(user._id.toString(), checkInTime);
    const data = { success: true, lastCheckInAt: checkInTime.toISOString() };
    const instance = plainToInstance(CheckInResponseDto, data, { excludeExtraneousValues: true });
    return instanceToPlain(instance) as any;
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

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.ADMIN_REPORT,
      action: AuditAction.SEND_DASHBOARD_REPORT,
      actor: {
        id: user._id.toString(),
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
        avatar: user?.avatar || '',
      },
      context: {
        reportType: 'Dashboard Report',
        timestamp: new Date().toISOString(),
      },
      outcome: {
        status: OutComeStatus.SUCCESS,
      },
    };

    try {
      await this.performanceService.sendCronSnapshotEmail(
        user._id.toString(),
      );
    } catch (err) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: err?.errorCode || 'INTERNAL_ERROR',
          errorMessage: err?.message || 'Failed to process uploaded file',
          errorName: err?.name || 'Error',
          errorStack: err?.stack?.split('\n')?.slice(0, 5)?.join('\n') || 'No stack trace available',
        },
      };
      await this.auditTrailsService.createAuditTrail(auditPayload);
      if(err instanceof InternalServerError){
        throw new InternalServerError(err.message);
      }
      throw new BadRequestError(
        err?.message || 'Failed to generate overall question report',
      );
    }
    await this.auditTrailsService.createAuditTrail(auditPayload);
    return {
      message: "Cron snapshot report email sent successfully.",
    };
  }


}
