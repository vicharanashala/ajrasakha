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

  getOverview(currentUserId: string, query: { startDateTime?: string; endDateTime?: string }): Promise<{
    userRoleOverview: UserRoleOverview[];
    stfExpertCount: number;
    stfModeratorCount: number;
    moderatorApprovalRate: ModeratorApprovalRate;
  }>;

  getGoldenDataset(query: GetGoldenDatasetQuery,isTrainingUser?: boolean, isAdmin?: boolean): Promise<GoldenDataset>;

  getContributionTrend(timeRange: string): Promise<QuestionContributionTrend[]>;

  getStatusOverview(): Promise<StatusOverview>;

  getExpertPerformance(): Promise<ExpertPerformance[]>;

  getQuestionsAnalytics(query: GetQuestionsAnalyticsQuery): Promise<Analytics>;

  updateCheckInTime(userId: string, time: Date): Promise<void>;

  sendCronSnapshotEmail(
    currentUserId: string
  ): Promise<void>;

  getLevelWiseReport(startDate:string, endDate:string, isTrainingUser?: boolean, isAdmin?: boolean): Promise<ArrayBuffer | null>;

  getShiftBasedMetrics(startDate:string, shift: string, source: string, from:string, to:string, isTrainingUser?: boolean, isAdmin?: boolean):  Promise<any>;

  getShiftBasedTrends(startDate:string, shift: string, source: string, from:string, to:string, isTrainingUser?: boolean, isAdmin?: boolean):  Promise<any>;

  getQuestionStatusDistribution(startDate:string, shift: string, source: string, from:string, to:string, isTrainingUser?: boolean, isAdmin?: boolean):  Promise<any>;

  getQuestionLevelDistribution(startDate:string, shift: string, source: string, from:string, to:string, isTrainingUser?: boolean, isAdmin?: boolean):  Promise<any>;

  getShiftBasedTopExperts(startDate:string, shift: string, source: string, from:string, to:string, isTrainingUser?: boolean, isAdmin?: boolean):  Promise<any>;

  getShiftBasedTopApprovingExperts(startDate:string, shift: string, source: string, from:string, to:string, isTrainingUser?: boolean, isAdmin?: boolean):  Promise<any>;
}
