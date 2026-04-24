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
    data: DashboardResponse;
  }>;

  getOverview(currentUserId: string): Promise<{
    userRoleOverview: UserRoleOverview[];
    moderatorApprovalRate: ModeratorApprovalRate;
  }>;

  getGoldenDataset(query: GetGoldenDatasetQuery): Promise<GoldenDataset>;

  getContributionTrend(timeRange: string): Promise<QuestionContributionTrend[]>;

  getStatusOverview(): Promise<StatusOverview>;

  getExpertPerformance(): Promise<ExpertPerformance[]>;

  getQuestionsAnalytics(query: GetQuestionsAnalyticsQuery): Promise<Analytics>;

  updateCheckInTime(userId: string, time: Date): Promise<void>;

  sendCronSnapshotEmail(
    currentUserId: string
  ): Promise<void>;

  getLevelWiseReport(startDate:string, endDate:string): Promise<ArrayBuffer | null>;
}
