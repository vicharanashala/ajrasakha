import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";
import { useQuery } from "@tanstack/react-query";

export type FarmerHeatMapGranularity = "monthly" | "weekly" | "daily" | "hourly";

export type FarmerHeatMapMetric =
  | "activeFarmers"
  | "totalQuestions"
  | "duplicateQuestions"
  | "closedQuestions"
  | "nonGdbQuestions"
  | "notifiedQuestions"
  | "averageClosureTimeMinutes";

export interface FarmerHeatMapFilters {
  state: string;
  district: string;
  block: string;
  village: string;
  granularity: FarmerHeatMapGranularity;
  startDate?: Date;
  endDate?: Date;
}

export interface FarmerHeatMapBucket {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  totals: FarmerHeatMapMetricTotals;
}

export interface FarmerHeatMapQuestionDetail {
  questionId: string;
  question: string;
  status: string;
  askedBy?: string;
  email?: string;
  userId?: string;
  state?: string;
  district?: string;
  block?: string;
  village?: string;
  crop?: string;
  domain?: string;
  createdAt?: string;
  isCustomerNotified?: boolean;
  referenceQuestionId?: string;
  referenceQuestion?: string;
}

export interface FarmerHeatMapCell {
  bucket: string;
  label: string;
  activeFarmers: number;
  totalQuestions: number;
  duplicateQuestions: number;
  closedQuestions: number;
  nonGdbQuestions?: number;
  notifiedQuestions: number;
  averageClosureTimeMinutes: number;
  statusDistribution: Record<string, number>;
  questionDetails: FarmerHeatMapQuestionDetail[];
}

export type FarmerHeatMapMetricTotals = Record<FarmerHeatMapMetric, number>;

export interface FarmerHeatMapRow {
  id: string;
  label: string;
  scope: "state" | "district" | "block" | "village";
  cells: FarmerHeatMapCell[];
  totals: FarmerHeatMapMetricTotals;
}

export interface FarmerHeatMapResponse {
  filters: Partial<FarmerHeatMapFilters>;
  buckets: FarmerHeatMapBucket[];
  rows: FarmerHeatMapRow[];
  totals: FarmerHeatMapMetricTotals;
  maxValues: Record<FarmerHeatMapMetric, number>;
}

export const DEFAULT_FARMER_HEAT_MAP_FILTERS: FarmerHeatMapFilters = {
  state: "all",
  district: "all",
  block: "all",
  village: "all",
  granularity: "monthly",
  startDate: undefined,
  endDate: undefined,
};

const EMPTY_FARMER_HEAT_MAP_RESPONSE: FarmerHeatMapResponse = {
  filters: {},
  buckets: [],
  rows: [],
  totals: {
    activeFarmers: 0,
    totalQuestions: 0,
    duplicateQuestions: 0,
    closedQuestions: 0,
    nonGdbQuestions: 0,
    notifiedQuestions: 0,
    averageClosureTimeMinutes: 0,
  },
  maxValues: {
    activeFarmers: 0,
    totalQuestions: 0,
    duplicateQuestions: 0,
    closedQuestions: 0,
    nonGdbQuestions: 0,
    notifiedQuestions: 0,
    averageClosureTimeMinutes: 0,
  },
};

export function useFarmerHeatMapAnalytics(
  filters: FarmerHeatMapFilters,
  source: "vicharanashala" | "annam" = "annam",
  userType: "all" | "external" | "internal" = "all",
  enabled = true,
) {
  return useQuery<FarmerHeatMapResponse, Error>({
    queryKey: ["farmer-heat-map", filters, source, userType],
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();

      params.set("source", source);
      params.set("granularity", filters.granularity);

      if (filters.state !== "all") params.set("state", filters.state);
      if (filters.district !== "all") params.set("district", filters.district);
      if (filters.block !== "all") params.set("block", filters.block);
      if (filters.village !== "all") params.set("village", filters.village);
      if (userType !== "all") params.set("userType", userType);
      if (filters.startDate) {
        params.set("startDate", filters.startDate.toISOString());
      }
      if (filters.endDate) {
        params.set("endDate", filters.endDate.toISOString());
      }

      return (
        (await apiFetch<FarmerHeatMapResponse>(
          `${env.apiBaseUrl()}/analytics/farmer-heat-map?${params.toString()}`,
        )) ?? EMPTY_FARMER_HEAT_MAP_RESPONSE
      );
    },
  });
}
