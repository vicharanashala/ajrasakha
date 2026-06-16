import type { HeatmapResponse, WorkLoad } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type {
  DashboardAnalyticsResponse,
  DashboardFilters,
} from "../api/performance/useGetDashboard";
import { formatDateLocal } from "@/utils/formatDate";
import type { DateRange, QuestionsAnalytics } from "@/components/dashboard/questions-analytics";
import { env } from "@/config/env";
import { auth } from "@/config/firebase";
import { getIdToken } from "firebase/auth";

const API_BASE_URL = env.apiBaseUrl();

export class PerformaneService {
  private _baseUrl = `${API_BASE_URL}/performance`;

  async getheatMapOfReviewers({
    startTime,
    endTime,
    page,
    limit,
  }: DateRange & {page:number,limit:number}): Promise<HeatmapResponse | null> {
    console.log("HeatMap of reviews in performance service");
    const params = new URLSearchParams();

    if (startTime) {
      params.append("startTime", formatDateLocal(startTime));
    }

    if (endTime) {
      params.append("endTime", formatDateLocal(endTime));
    }
    params.append("page",page.toString());
    params.append("limit",limit.toString());

    return apiFetch<HeatmapResponse>(
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

  async getOverview(): Promise<{
    userRoleOverview: UserRoleOverview[];
    moderatorApprovalRate: ModeratorApprovalRate;
  } | null> {
    return apiFetch<{
      userRoleOverview: UserRoleOverview[];
      moderatorApprovalRate: ModeratorApprovalRate;
    }>(`${this._baseUrl}/overview`);
  }

  async getGoldenDataset(query: {
    viewType: string;
    selectedYear?: string;
    selectedMonth?: string;
    selectedWeek?: string;
    selectedDay?: string;
    customStartDateTime?: string;
    customEndDateTime?: string;
  }): Promise<GoldenDataset | null> {
    const params = new URLSearchParams();
    params.append("viewType", query.viewType);
    if (query.selectedYear) params.append("selectedYear", query.selectedYear);
    if (query.selectedMonth)
      params.append("selectedMonth", query.selectedMonth);
    if (query.selectedWeek) params.append("selectedWeek", query.selectedWeek);
    if (query.selectedDay) params.append("selectedDay", query.selectedDay);
    if (query.customStartDateTime)
      params.append("customStartDateTime", query.customStartDateTime);
    if (query.customEndDateTime)
      params.append("customEndDateTime", query.customEndDateTime);

    return apiFetch<GoldenDataset>(
      `${this._baseUrl}/golden-dataset?${params.toString()}`
    );
  }

  async getContributionTrend(timeRange: string): Promise<
    DashboardAnalyticsResponse["questionContributionTrend"] | null
  > {
    const params = new URLSearchParams();
    params.append("timeRange", timeRange);
    return apiFetch<DashboardAnalyticsResponse["questionContributionTrend"]>(
      `${this._baseUrl}/contribution-trend?${params.toString()}`
    );
  }

  async getStatusOverview(): Promise<StatusOverview | null> {
    return apiFetch<StatusOverview>(`${this._baseUrl}/status-overview`);
  }

  async getExpertPerformance(): Promise<ExpertPerformance[] | null> {
    return apiFetch<ExpertPerformance[]>(`${this._baseUrl}/expert-performance`);
  }

  async getQuestionsAnalytics(query: {
    type: "question" | "answer";
    startTime?: Date;
    endTime?: Date;
    status?: string[];
    state?: string[];
    source?: string[];
    crop?: string[];
  }): Promise<QuestionsAnalytics | null> {
    const body: Record<string, unknown> = { type: query.type };
    if (query.startTime) body.startTime = formatDateLocal(query.startTime);
    if (query.endTime) body.endTime = formatDateLocal(query.endTime);
    if (query.status?.length) body.status = query.status;
    if (query.state?.length) body.state = query.state;
    if (query.source?.length) body.source = query.source;
    if (query.crop?.length) body.crop = query.crop;

    return apiFetch<QuestionsAnalytics>(
      `${this._baseUrl}/questions-analytics`,
      { method: "POST", body: JSON.stringify(body) }
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

  async sendCronSnapshotReport(): Promise<void> {
   await apiFetch(`${this._baseUrl}/cron-snapshot/send-report`, {
    method: "POST",
  });
}

async downloadLevelWiseReport(fromDate:string,toDate:string): Promise<Blob> {

  const params = new URLSearchParams();
  params.append("startDate", fromDate);
  params.append("endDate", toDate);

  // Get the current Firebase user and token
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      throw new Error("User not authenticated");
    }
  const token = await getIdToken(firebaseUser);
  const response = await fetch(
    `${this._baseUrl}/level-report?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`, 
      },
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to download report");
  }
  
  // Check if response is JSON (no data case)
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    const jsonResponse = await response.json();
    if (!jsonResponse.success) {
      throw new Error(jsonResponse.message || "No data found for the selected filters");
    }
  }
  
  return await response.blob();
}

  async getShiftBasedMetrics(fromDate:string,
    // toDate:string,
     shift: string,source: string): Promise<any> {

    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);

    params.append("source",source);

    // Get the current Firebase user and token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("User not authenticated");
      }
    const token = await getIdToken(firebaseUser);
    const response = await fetch(
      `${this._baseUrl}/shift-based-metrics?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, 
        },
      }
    );
    return await response.json();
  }

// /shift-based-trends
  async getShiftWiseTrends(fromDate:string,
    // toDate:string,
     shift: string, source: string): Promise<any> {

    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source",source);

    // Get the current Firebase user and token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("User not authenticated");
      }
    const token = await getIdToken(firebaseUser);
    const response = await fetch(
      `${this._baseUrl}/shift-based-trends?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, 
        },
      }
    );
    return await response.json();
  }

  async getStatusDistribution(fromDate:string,
    // toDate:string, 
    shift: string, source: string): Promise<any> {

    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append('source',source);

    // Get the current Firebase user and token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("User not authenticated");
      }
    const token = await getIdToken(firebaseUser);
    const response = await fetch(
      `${this._baseUrl}/shift-based-status-distribution?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, 
        },
      }
    );
    return await response.json();
  }


  async getLevelDistribution(fromDate:string,
    // toDate:string,
     shift: string, source: string): Promise<any> {

    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source",source);

    // Get the current Firebase user and token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("User not authenticated");
      }
    const token = await getIdToken(firebaseUser);
    const response = await fetch(
      `${this._baseUrl}/shift-based-level-distribution?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, 
        },
      }
    );
    return await response.json();
  }

  async getShiftBasedTopExperts(fromDate:string,
    // toDate:string,
     shift: string, source: string): Promise<any> {

    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source",source);

    // Get the current Firebase user and token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("User not authenticated");
      }
    const token = await getIdToken(firebaseUser);
    const response = await fetch(
      `${this._baseUrl}/shift-based-top-experts?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, 
        },
      }
    );
    return await response.json();
  }

  async getShiftBasedTopApprovingExperts(fromDate:string,
    // toDate:string,
     shift: string, source: string): Promise<any> {

    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source",source);

    // Get the current Firebase user and token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("User not authenticated");
      }
    const token = await getIdToken(firebaseUser);
    const response = await fetch(
      `${this._baseUrl}/shift-based-top-approving-experts?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, 
        },
      }
    );
    return await response.json();
  }

  async getShiftBasedAuditActionCounts(fromDate:string,
    // toDate:string, 
    shift: string): Promise<any> {

    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
     // Get the current Firebase user and token
      const firebaseUser = auth.currentUser;
      if (!firebaseUser) {
        throw new Error("User not authenticated");
      }
    const token = await getIdToken(firebaseUser);
    const response = await fetch(
      `${`${API_BASE_URL}/audit-trails`}/shift-based-audit-action-counts?${params.toString()}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`, 
        },
      }
    );
    return await response.json();
  }
} 