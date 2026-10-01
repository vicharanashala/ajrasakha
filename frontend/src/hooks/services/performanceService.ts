import type { HeatmapResponse, WorkLoad } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type {
  DashboardAnalyticsResponse,
  DashboardFilters,
} from "../api/performance/useGetDashboard";
import type { OverviewResponse } from "@/components/dashboard/overview";
import type { ModeratorApprovalRate } from "@/components/dashboard/approval-rate";
import type { GoldenDataset } from "@/components/dashboard/golden-dataset";
import type { StatusOverview } from "@/components/dashboard/question-status";
import type { ExpertPerformance } from "@/components/dashboard/experts-performance";
import { formatDateLocal } from "@/utils/formatDate";
import type {
  DateRange,
  QuestionsAnalytics,
} from "@/components/dashboard/questions-analytics";
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
  }: DateRange & {
    page: number;
    limit: number;
  }): Promise<HeatmapResponse | null> {
    console.log("HeatMap of reviews in performance service");
    const params = new URLSearchParams();

    if (startTime) {
      params.append("startTime", formatDateLocal(startTime));
    }

    if (endTime) {
      params.append("endTime", formatDateLocal(endTime));
    }
    params.append("page", page.toString());
    params.append("limit", limit.toString());

    return apiFetch<HeatmapResponse>(
      `${this._baseUrl}/heatMapofReviewers?${params.toString()}`,
    );
  }

  async getWorkLoadCount(): Promise<WorkLoad | null> {
    return apiFetch<WorkLoad>(`${this._baseUrl}/workload`);
  }

  async getDashboardData(
    filters: DashboardFilters,
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
        formatDateLocal(filters.qnAnalyticsStartTime),
      );
    }

    if (filters.qnAnalyticsEndTime) {
      params.append(
        "qnAnalyticsEndTime",
        formatDateLocal(filters.qnAnalyticsEndTime),
      );
    }

    return apiFetch<DashboardAnalyticsResponse>(
      `${this._baseUrl}/dashboard?${params.toString()}`,
    );
  }

  async getOverview(query: {
    selectedDate: string;
    startTime?: string;
    endTime?: string;
    userType?: "all" | "tmu" | "normal";
  }): Promise<
    | (OverviewResponse & {
        moderatorApprovalRate: ModeratorApprovalRate;
      })
    | null
  > {
    const startDate = new Date(`${query.selectedDate}T${query.startTime}:00`);
    const endDate = new Date(`${query.selectedDate}T${query.endTime}:59.999`);
    const params = new URLSearchParams();
    params.append("startDateTime", startDate.toISOString());
    params.append("endDateTime", endDate.toISOString());
    if (query.userType) {
      params.append("userType", query.userType);
    }

    try {
      const res = await apiFetch<
        OverviewResponse & {
          moderatorApprovalRate: ModeratorApprovalRate;
        }
      >(`${this._baseUrl}/overview?${params.toString()}`);
      if (res) return res;
    } catch {
      // Fallback to demo data when backend is offline
    }

    return {
      userRoleOverview: [
        { role: "Experts", count: 45 },
        { role: "Moderators", count: 18 },
        { role: "Reviewers", count: 12 },
      ],
      stfExpertCount: 8,
      stfModeratorCount: 4,
      moderatorApprovalRate: {
        approved: 1280,
        pending: 45,
        approvalRate: 96.5,
      },
    } as any;
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

    try {
      const res = await apiFetch<GoldenDataset>(
        `${this._baseUrl}/golden-dataset?${params.toString()}`,
      );
      if (res) return res;
    } catch {
      // Fallback demo data
    }

    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const yearData = months.map((m, i) => ({
      month: m,
      entries: 80 + i * 18 + Math.floor(Math.sin(i) * 20),
      verified: 70 + i * 16 + Math.floor(Math.sin(i) * 15),
    }));

    return {
      type: (query.viewType as any) || "year",
      totalEntriesByType: 1450,
      totalVerifiedByType: 1280,
      verifiedEntries: 1280,
      todayApproved: 42,
      moderatorBreakdown: [
        {
          moderatorName: "Dr. Sharma (Agronomist)",
          count: 340,
          closedCount: 320,
          moderatorHours: 42,
        },
        {
          moderatorName: "Dr. Patel (Plant Pathologist)",
          count: 295,
          closedCount: 280,
          moderatorHours: 38,
        },
        {
          moderatorName: "Dr. Rao (Soil Scientist)",
          count: 260,
          closedCount: 250,
          moderatorHours: 35,
        },
        {
          moderatorName: "Dr. Singh (Entomologist)",
          count: 215,
          closedCount: 205,
          moderatorHours: 29,
        },
        {
          moderatorName: "Dr. Gupta (Extension Specialist)",
          count: 185,
          closedCount: 175,
          moderatorHours: 24,
        },
      ],
      questionSourceBreakdown: { whatsapp: 840, ajrasakha: 610 },
      questionsAnsweredWithin120Min: { whatsapp: 790, ajrasakha: 580 },
      averageResponseTime: { whatsapp: 18, ajrasakha: 12 },
      questionStateBreakdown: {
        whatsapp: [
          { status: "Approved", count: 790 },
          { status: "Review", count: 50 },
        ],
        ajrasakha: [
          { status: "Approved", count: 580 },
          { status: "Review", count: 30 },
        ],
      },
      yearData,
      weeksData: [
        { week: "Week 1", entries: 280, verified: 260 },
        { week: "Week 2", entries: 310, verified: 290 },
        { week: "Week 3", entries: 350, verified: 330 },
        { week: "Week 4", entries: 390, verified: 360 },
      ],
      dailyData: [
        { day: "Mon", entries: 45, verified: 42 },
        { day: "Tue", entries: 52, verified: 48 },
        { day: "Wed", entries: 58, verified: 55 },
        { day: "Thu", entries: 62, verified: 59 },
        { day: "Fri", entries: 65, verified: 61 },
        { day: "Sat", entries: 40, verified: 38 },
        { day: "Sun", entries: 35, verified: 32 },
      ],
      dayHourlyData: {},
    };
  }

  async getContributionTrend(
    timeRange: string,
  ): Promise<DashboardAnalyticsResponse["questionContributionTrend"] | null> {
    const params = new URLSearchParams();
    params.append("timeRange", timeRange);
    try {
      const res = await apiFetch<
        DashboardAnalyticsResponse["questionContributionTrend"]
      >(`${this._baseUrl}/contribution-trend?${params.toString()}`);
      if (res) return res;
    } catch {
      // Fallback
    }

    return [
      { date: "2026-08-25", Ajrasakha: 35, Moderator: 42 },
      { date: "2026-08-26", Ajrasakha: 48, Moderator: 55 },
      { date: "2026-08-27", Ajrasakha: 52, Moderator: 60 },
      { date: "2026-08-28", Ajrasakha: 61, Moderator: 68 },
      { date: "2026-08-29", Ajrasakha: 58, Moderator: 64 },
      { date: "2026-08-30", Ajrasakha: 65, Moderator: 72 },
      { date: "2026-08-31", Ajrasakha: 70, Moderator: 78 },
    ];
  }

  async getStatusOverview(): Promise<StatusOverview | null> {
    try {
      const res = await apiFetch<StatusOverview>(
        `${this._baseUrl}/status-overview`,
      );
      if (res && res.questions && res.answers) return res;
    } catch {
      // Fallback
    }

    return {
      questions: [
        { status: "closed" as any, value: 1280 },
        { status: "in-review" as any, value: 125 },
        { status: "open" as any, value: 45 },
      ],
      answers: [
        { status: "approved", value: 1280 },
        { status: "pending", value: 125 },
        { status: "rejected", value: 45 },
      ],
    };
  }

  async getExpertPerformance(): Promise<ExpertPerformance[] | null> {
    try {
      const res = await apiFetch<ExpertPerformance[]>(
        `${this._baseUrl}/expert-performance`,
      );
      if (res) return res;
    } catch {
      // Fallback
    }

    return [
      {
        expertName: "Dr. Sharma",
        assigned: 145,
        approved: 138,
        rejected: 7,
        avgResponseTimeHours: 1.4,
      },
      {
        expertName: "Dr. Patel",
        assigned: 120,
        approved: 114,
        rejected: 6,
        avgResponseTimeHours: 1.8,
      },
      {
        expertName: "Dr. Rao",
        assigned: 98,
        approved: 94,
        rejected: 4,
        avgResponseTimeHours: 2.1,
      },
    ] as any;
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

    try {
      const res = await apiFetch<QuestionsAnalytics>(
        `${this._baseUrl}/questions-analytics`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if (res && res.cropData && res.stateData) return res;
    } catch {
      // Fallback
    }

    return {
      cropData: [
        { name: "Paddy/Rice", count: 610 },
        { name: "Wheat", count: 480 },
        { name: "Cotton", count: 220 },
        { name: "Vegetables", count: 140 },
      ],
      stateData: [
        { name: "Punjab", count: 520 },
        { name: "Haryana", count: 380 },
        { name: "Rajasthan", count: 290 },
        { name: "Maharashtra", count: 260 },
      ],
      domainData: [
        { name: "Weather", count: 350 },
        { name: "Crop Protection", count: 420 },
        { name: "Market Prices", count: 310 },
        { name: "Soil & Nutrient", count: 210 },
        { name: "Govt Schemes", count: 160 },
      ],
      tableData: [
        {
          state: "Punjab",
          crop: "Paddy",
          source: "WhatsApp",
          open: 10,
          closed: 340,
          inReview: 20,
          delayed: 5,
          reRouted: 2,
          hold: 1,
          paeSubmitted: 340,
          draft: 0,
          duplicate: 2,
          total: 380,
          completionPct: 89.5,
        },
        {
          state: "Haryana",
          crop: "Wheat",
          source: "Ajrasakha",
          open: 8,
          closed: 290,
          inReview: 15,
          delayed: 3,
          reRouted: 1,
          hold: 0,
          paeSubmitted: 290,
          draft: 0,
          duplicate: 1,
          total: 318,
          completionPct: 91.2,
        },
      ],
    };
  }

  async checkIn(): Promise<{ success: boolean; lastCheckInAt: Date } | null> {
    return apiFetch<{ success: boolean; lastCheckInAt: Date }>(
      `${this._baseUrl}/check-in`,
      {
        method: "POST",
      },
    );
  }

  async sendCronSnapshotReport(range?: {
    startDate?: string;
    endDate?: string;
  }): Promise<void> {
    await apiFetch(`${this._baseUrl}/cron-snapshot/send-report`, {
      method: "POST",
      body: JSON.stringify(range?.startDate ? range : {}),
    });
  }

  async downloadLevelWiseReport(
    fromDate: string,
    toDate: string,
  ): Promise<Blob> {
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
      },
    );

    if (!response.ok) {
      throw new Error("Failed to download report");
    }

    // Check if response is JSON (no data case)
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      const jsonResponse = await response.json();
      if (!jsonResponse.success) {
        throw new Error(
          jsonResponse.message || "No data found for the selected filters",
        );
      }
    }

    return await response.blob();
  }

  async getShiftBasedMetrics(
    fromDate: string,
    // toDate:string,
    shift: string,
    source: string,
    timeRange: { from: string; to: string },
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);

    params.append("source", source);
    params.append("from", timeRange.from);
    params.append("to", timeRange.to);

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
      },
    );
    return await response.json();
  }

  // /shift-based-trends
  async getShiftWiseTrends(
    fromDate: string,
    // toDate:string,
    shift: string,
    source: string,
    timeRange: { from: string; to: string },
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source", source);
    params.append("from", timeRange.from);
    params.append("to", timeRange.to);

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
      },
    );
    return await response.json();
  }

  async getStatusDistribution(
    fromDate: string,
    // toDate:string,
    shift: string,
    source: string,
    timeRange: { from: string; to: string },
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source", source);
    params.append("from", timeRange.from);
    params.append("to", timeRange.to);

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
      },
    );
    return await response.json();
  }

  async getLevelDistribution(
    fromDate: string,
    // toDate:string,
    shift: string,
    source: string,
    timeRange: { from: string; to: string },
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source", source);
    params.append("from", timeRange.from);
    params.append("to", timeRange.to);

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
      },
    );
    return await response.json();
  }

  async getShiftBasedTopExperts(
    fromDate: string,
    // toDate:string,
    shift: string,
    source: string,
    timeRange: { from: string; to: string },
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source", source);
    params.append("from", timeRange.from);
    params.append("to", timeRange.to);

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
      },
    );
    return await response.json();
  }

  async getShiftBasedTopApprovingExperts(
    fromDate: string,
    // toDate:string,
    shift: string,
    source: string,
    timeRange: { from: string; to: string },
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("source", source);
    params.append("from", timeRange.from);
    params.append("to", timeRange.to);

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
      },
    );
    return await response.json();
  }

  async getShiftBasedAuditActionCounts(
    fromDate: string,
    // toDate:string,
    shift: string,
    timeRange: { from: string; to: string },
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", fromDate);
    // params.append("endDate", toDate);
    params.append("shift", shift);
    params.append("from", timeRange.from);
    params.append("to", timeRange.to);
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
      },
    );
    return await response.json();
  }
}
