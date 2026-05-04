import { IReviewerHeatmapResponse } from '#root/shared/interfaces/models.js';
import {
  Analytics,
  DashboardResponse,
  ExpertPerformance,
  GetDashboardQuery,
  GetGoldenDatasetQuery,
  GetHeatMapQuery,
  GetQuestionsAnalyticsQuery,
  GoldenDataset,
  ModeratorApprovalRate,
  QuestionContributionTrend,
  StatusOverview,
  UserRoleOverview,
} from '#root/modules/dashboard/validators/DashboardValidators.js';
import {
  DashboardResponseDto,
  AnalyticsDto,
  ExpertPerformanceDto,
  GoldenDatasetDto,
  ModeratorApprovalRateDto,
  QuestionContributionTrendDto,
  StatusOverviewDto,
  UserRoleOverviewDto,
  OverviewResponseDto,
} from '#root/modules/dashboard/dtos/DashboardResponseDto.js';

export interface IPerformanceService {
  /**
   * Reviewer heatmap data
   */
  getHeatMapresults(
    query: GetHeatMapQuery
  ): Promise<IReviewerHeatmapResponse | null>;

  /**
   * Current logged-in user's workload
   */
  getCurrentUserWorkLoad(currentUserId: string): Promise<{
    currentUserAnswersCount: number;
    totalQuestionsCount: number;
    totalInreviewQuestionsCount: number;
  }>;

  /**
   * Complete dashboard data for admin/moderator
   */
  getDashboardData(
    currentUserId: string,
    query: GetDashboardQuery
  ): Promise<{
    data: DashboardResponseDto;
  }>;

  getOverview(currentUserId: string): Promise<OverviewResponseDto>;

  getGoldenDataset(query: GetGoldenDatasetQuery): Promise<GoldenDatasetDto>;

  getContributionTrend(timeRange: string): Promise<QuestionContributionTrendDto[]>;

  getStatusOverview(): Promise<StatusOverviewDto>;

  getExpertPerformance(): Promise<ExpertPerformanceDto[]>;

  getQuestionsAnalytics(query: GetQuestionsAnalyticsQuery): Promise<AnalyticsDto>;

  updateCheckInTime(userId: string, time: Date): Promise<void>;

  sendCronSnapshotEmail(
    currentUserId: string
  ): Promise<void>;

  getLevelWiseReport(startDate:string, endDate:string): Promise<ArrayBuffer | null>;
}
