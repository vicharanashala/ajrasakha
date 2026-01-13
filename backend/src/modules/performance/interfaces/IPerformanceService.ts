import { IReviewerHeatmapRow } from '#root/shared/interfaces/models.js';
import {
  DashboardResponse,
  GetDashboardQuery,
  GetHeatMapQuery,
} from '#root/modules/core/classes/validators/DashboardValidators.js';

export interface IPerformanceService {
  /**
   * Reviewer heatmap data
   */
  getHeatMapresults(
    query: GetHeatMapQuery
  ): Promise<IReviewerHeatmapRow[] | null>;

  /**
   * Current logged-in user's workload
   */
  getCurrentUserWorkLoad(currentUserId: string): Promise<{
    currentUserAnswers: any[];
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
}
