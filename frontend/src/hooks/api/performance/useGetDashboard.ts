import { useQuery } from "@tanstack/react-query";
import { PerformaneService } from "../../services/performanceService";
import type { UserRoleOverview } from "@/components/dashboard/overview";
import type { ModeratorApprovalRate } from "@/components/dashboard/approval-rate";
import type { GoldenDataset } from "@/components/dashboard/golden-dataset";
import type { StatusOverview } from "@/components/dashboard/question-status";
import type { ExpertPerformance } from "@/components/dashboard/experts-performance";
import type { DateRange } from "@/components/dashboard/questions-analytics";
import type { ViewType } from "@/components/dashboard";

export interface DashboardAnalyticsResponse {
  userRoleOverview: UserRoleOverview[];
  moderatorApprovalRate: ModeratorApprovalRate;
  goldenDataset: GoldenDataset;
  questionContributionTrend: {
    date: string;
    Ajraskha: number;
    Moderator: number;
  }[];
  statusOverview: StatusOverview;
  expertPerformance: ExpertPerformance[];
}

export interface DashboardFilters {
  goldenDataViewType: string;
  goldenDataSelectedYear: string;
  goldenDataSelectedMonth: string;
  goldenDataSelectedWeek: string;
  goldenDataSelectedDay: string;
  sourceChartTimeRange: string;
  qnAnalyticsStartTime?: Date;
  qnAnalyticsEndTime?: Date;
}

const performaceService = new PerformaneService();
export const useGetDashboardData = ({
  goldenDataSelectedYear,
  goldenDataSelectedDay,
  goldenDataSelectedMonth,
  goldenDataSelectedWeek,
  goldenDataViewType,
  sourceChartTimeRange,
  qnAnalyticsEndTime,
  qnAnalyticsStartTime,
}: DashboardFilters) => {
  const { data, isLoading, error, refetch } = useQuery<
    DashboardAnalyticsResponse | null,
    Error
  >({
    queryKey: [
      "dashboard",
      goldenDataSelectedYear,
      goldenDataSelectedDay,
      goldenDataSelectedMonth,
      goldenDataSelectedWeek,
      goldenDataViewType,
      sourceChartTimeRange,
      qnAnalyticsEndTime,
      qnAnalyticsStartTime,
    ],
    queryFn: async () => {
      return await performaceService.getDashboardData({
        goldenDataSelectedYear,
        goldenDataSelectedDay,
        goldenDataSelectedMonth,
        goldenDataSelectedWeek,
        goldenDataViewType,
        sourceChartTimeRange,
        qnAnalyticsEndTime,
        qnAnalyticsStartTime,
      });
    },
  });

  return { data, isLoading, error, refetch };
};
