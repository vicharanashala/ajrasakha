import type { HeatMapResult, WorkLoad } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type {
  DashboardAnalyticsResponse,
  DashboardFilters,
} from "../api/performance/useGetDashboard";
import { formatDateLocal } from "@/utils/formatDate";
import type { DateRange } from "@/components/dashboard/questions-analytics";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export class PerformaneService {
  private _baseUrl = `${API_BASE_URL}/performance`;

  async getheatMapOfReviewers({
    startTime,
    endTime,
  }: DateRange): Promise<HeatMapResult[] | null> {
    const params = new URLSearchParams();

    if (startTime) {
      params.append("startTime", formatDateLocal(startTime));
    }

    if (endTime) {
      params.append("endTime", formatDateLocal(endTime));
    }

    return apiFetch<HeatMapResult[]>(
      `${this._baseUrl}/heatMapofReviewers?${params.toString()}`
    );
  }

  async getWorkLoadCount(): Promise<WorkLoad | null> {
    return apiFetch<WorkLoad>(`${this._baseUrl}/workload`);
  }

  async getDashboardData(
    filters: DashboardFilters
  ): Promise<DashboardAnalyticsResponse | null> {
    const params = new URLSearchParams();

    params.append("goldenDataViewType", filters.goldenDataViewType);
    params.append("goldenDataSelectedYear", filters.goldenDataSelectedYear);
    params.append("goldenDataSelectedMonth", filters.goldenDataSelectedMonth);
    params.append("goldenDataSelectedWeek", filters.goldenDataSelectedWeek);
    params.append("goldenDataSelectedDay", filters.goldenDataSelectedDay);
    params.append("sourceChartTimeRange", filters.sourceChartTimeRange);
    params.append("qnAnalyticsType", filters.qnAnalyticsType);

    if (filters.qnAnalyticsStartTime) {
      params.append(
        "qnAnalyticsStartTime",
        formatDateLocal(filters.qnAnalyticsStartTime)
      );
    }

    if (filters.qnAnalyticsEndTime) {
      params.append(
        "qnAnalyticsEndTime",
        formatDateLocal(filters.qnAnalyticsEndTime)
      );
    }

    return apiFetch<DashboardAnalyticsResponse>(
      `${this._baseUrl}/dashboard?${params.toString()}`
    );
  }

  async checkIn(): Promise<{ success: boolean; lastCheckInAt: Date } | null> {
    return apiFetch<{ success: boolean; lastCheckInAt: Date }>(
      `${this._baseUrl}/check-in`,
      {
        method: "POST",
      }
    );
  }

  async getCronSnapshot(): Promise<{database: string;generatedAt: string;totalCollections: number;collections:
  { collectionName: string; documentCount: number }[];} | null> {
  return apiFetch(`${this._baseUrl}/cron-snapshot`);
  }

} 
