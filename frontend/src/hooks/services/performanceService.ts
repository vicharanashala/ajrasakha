import type { HeatMapResult, WorkLoad } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type {
  DashboardAnalyticsResponse,
  DashboardFilters,
} from "../api/performance/useGetDashboard";
import { formatDateLocal } from "@/utils/formatDate";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class PerformaneService {
  private _baseUrl = `${API_BASE_URL}/performance`;

  async getheatMapOfReviewers(): Promise<HeatMapResult[] | null> {
    return apiFetch<HeatMapResult[]>(`${this._baseUrl}/heatMapofReviewers`);
  }
  async getWorkLoadCount(): Promise<WorkLoad | null> {
    return apiFetch<WorkLoad>(`${this._baseUrl}/workload`);
  }

  async getDashboardData(
    filters: DashboardFilters
  ): Promise<DashboardAnalyticsResponse | null> {
    const params = new URLSearchParams();

    params.append("goldenDataViewType", filters.goldenDataViewType);
    params.append("goldenDataSelectedMonth", filters.goldenDataSelectedMonth);
    params.append("goldenDataSelectedWeek", filters.goldenDataSelectedWeek);
    params.append("goldenDataSelectedDay", filters.goldenDataSelectedDay);
    params.append("sourceChartTimeRange", filters.sourceChartTimeRange);

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
}
