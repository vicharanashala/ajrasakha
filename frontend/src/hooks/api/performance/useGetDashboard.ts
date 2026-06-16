import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PerformaneService } from "../../services/performanceService";
import type { UserRoleOverview } from "@/components/dashboard/overview";
import type { ModeratorApprovalRate } from "@/components/dashboard/approval-rate";
import type { GoldenDataset } from "@/components/dashboard/golden-dataset";
import type { StatusOverview } from "@/components/dashboard/question-status";
import type { ExpertPerformance } from "@/components/dashboard/experts-performance";
import type {
  QuestionsAnalytics,
} from "@/components/dashboard/questions-analytics";

export interface DashboardAnalyticsResponse {
  userRoleOverview: UserRoleOverview[];
  moderatorApprovalRate: ModeratorApprovalRate;
  goldenDataset: GoldenDataset;
  questionContributionTrend: {
    date: string;
    Ajrasakha: number;
    Moderator: number;
  }[];
  statusOverview: StatusOverview;
  expertPerformance: ExpertPerformance[];
  analytics: QuestionsAnalytics;
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
  qnAnalyticsType: "question" | "answer"
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
  qnAnalyticsType
}: DashboardFilters) => {
  const { data, isLoading, isFetching, error, refetch } = useQuery<
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
      qnAnalyticsType
    ],
    placeholderData: keepPreviousData,
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
        qnAnalyticsType
      });
    },
  });

  return { data, isLoading, isFetching, error, refetch };
};

export const useGetOverview = () => {
  return useQuery({
    queryKey: ["dashboard", "overview"],
    queryFn: () => performaceService.getOverview(),
  });
};

export const useGetGoldenDataset = (query: {
  viewType: string;
  selectedYear?: string;
  selectedMonth?: string;
  selectedWeek?: string;
  selectedDay?: string;
  customStartDateTime?: string;
  customEndDateTime?: string;
}) => {
  return useQuery({
    queryKey: ["dashboard", "golden-dataset", query],
    queryFn: () => performaceService.getGoldenDataset(query),
    placeholderData: keepPreviousData,
  });
};

export const useGetContributionTrend = (timeRange: string) => {
  return useQuery({
    queryKey: ["dashboard", "contribution-trend", timeRange],
    queryFn: () => performaceService.getContributionTrend(timeRange),
    placeholderData: keepPreviousData,
  });
};

export const useGetStatusOverview = () => {
  return useQuery({
    queryKey: ["dashboard", "status-overview"],
    queryFn: () => performaceService.getStatusOverview(),
  });
};

export const useGetExpertPerformance = () => {
  return useQuery({
    queryKey: ["dashboard", "expert-performance"],
    queryFn: () => performaceService.getExpertPerformance(),
  });
};

export const useGetQuestionsAnalytics = (query: {
  type: "question" | "answer";
  startTime?: Date;
  endTime?: Date;
  status?: string[];
  state?: string[];
  source?: string[];
  crop?: string[];
}) => {
  return useQuery({
    queryKey: ["dashboard", "questions-analytics", query],
    queryFn: () => performaceService.getQuestionsAnalytics(query),
    placeholderData: keepPreviousData,
  });
};

export const useShiftBasedMetrics = (
  query: {
    fromDate: string;
    // toDate: string;
    shift: string;
    source: string;
  }
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "shift-based-metrics",
      query.fromDate,
      // query.toDate,
      query.shift,
      query.source
    ],

    queryFn: () =>
      performaceService.getShiftBasedMetrics(
        query.fromDate,
        // query.toDate,
        query.shift,
        query.source,
      ),

    placeholderData: keepPreviousData,
  });
};

export const useShiftBasedTrends = (
    query: {
    fromDate: string;
    // toDate: string;
    shift: string;
    source: string;
  }
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "shift-based-trends",
      query.fromDate,
      // query.toDate,
      query.shift,
      query.source,
    ],

    queryFn: () =>
      performaceService.getShiftWiseTrends(
        query.fromDate,
        // query.toDate,
        query.shift,
        query.source
      ),

    placeholderData: keepPreviousData,
  });
};

export const useShiftBasedStatusDistribution = (
    query: {
    fromDate: string;
    // toDate: string;
    shift: string;
    source: string;
  }
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "shift-based-status-distribution",
      query.fromDate,
      // query.toDate,
      query.shift,
      query.source
    ],

    queryFn: () =>
      performaceService.getStatusDistribution(
        query.fromDate,
        // query.toDate,
        query.shift,
        query.source,
      ),

    placeholderData: keepPreviousData,
  });
};


export const useShiftBasedLevelDistribution = (
    query: {
    fromDate: string;
    // toDate: string;
    shift: string;
    source: string;
  }
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "shift-based-level-distribution",
      query.fromDate,
      // query.toDate,
      query.shift,
      query.source,
    ],

    queryFn: () =>
      performaceService.getLevelDistribution(
        query.fromDate,
        // query.toDate,
        query.shift,
        query.source,
      ),

    placeholderData: keepPreviousData,
  });
};

export const useShiftBasedTopExperts = (
    query: {
    fromDate: string;
    // toDate: string;
    shift: string;
    source: string;
  }
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "shift-based-top-experts",
      query.fromDate,
      // query.toDate,
      query.shift,
      query.source,
    ],

    queryFn: () =>
      performaceService.getShiftBasedTopExperts(
        query.fromDate,
        // query.toDate,
        query.shift,
        query.source,
      ),

    placeholderData: keepPreviousData,
  });
};

// getShiftBasedTopApprovingExperts
export const useShiftBasedTopApprovingExperts = (
    query: {
    fromDate: string;
    // toDate: string;
    shift: string;
    source: string;
  }
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "shift-based-top-approving-experts",
      query.fromDate,
      // query.toDate,
      query.shift,
      query.source,
    ],

    queryFn: () =>
      performaceService.getShiftBasedTopApprovingExperts(
        query.fromDate,
        // query.toDate,
        query.shift,
        query.source,
      ),

    placeholderData: keepPreviousData,
  });
};


export const useShiftBasedAuditActionCounts = (
    query: {
    fromDate: string;
    // toDate: string;
    shift: string;
  }
) => {
  return useQuery({
    queryKey: [
      "dashboard",
      "shift-based-audit-action-counts",
      query.fromDate,
      // query.toDate,
      query.shift,
    ],

    queryFn: () =>
      performaceService.getShiftBasedAuditActionCounts(
        query.fromDate,
        // query.toDate,
        query.shift
      ),

    placeholderData: keepPreviousData,
  });
};