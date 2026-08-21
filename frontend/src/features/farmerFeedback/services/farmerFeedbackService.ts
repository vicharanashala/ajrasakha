import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type {
  IFarmerFeedbackStats,
  IDomainBreakdown,
  ILanguageBreakdown,
  IStateBreakdown,
  IGDBFeedbackSummary,
  IWeeklyDigestReport,
  IFeedbackFilterState,
} from "../types";

export class FarmerFeedbackApiService {
  private static get baseUrl(): string {
    return `${env.apiBaseUrl()}/farmer-feedback`;
  }

  private static buildQueryParams(filters: Partial<IFeedbackFilterState>): URLSearchParams {
    const params = new URLSearchParams();
    if (filters.startDate) params.append("startDate", filters.startDate);
    if (filters.endDate) params.append("endDate", filters.endDate);
    if (filters.domain) params.append("domain", filters.domain);
    if (filters.state) params.append("state", filters.state);
    if (filters.crop) params.append("crop", filters.crop);
    if (filters.language) params.append("language", filters.language);
    if (filters.source) params.append("source", filters.source);
    if (typeof filters.isHelpful === "boolean") params.append("isHelpful", String(filters.isHelpful));
    if (filters.search) params.append("search", filters.search);
    if (filters.page) params.append("page", String(filters.page));
    if (filters.limit) params.append("limit", String(filters.limit));
    return params;
  }

  static async getMetrics(filters: Partial<IFeedbackFilterState>): Promise<IFarmerFeedbackStats> {
    const params = this.buildQueryParams(filters);
    const res = await apiFetch<{ success: boolean; data: IFarmerFeedbackStats }>(
      `${this.baseUrl}/metrics?${params.toString()}`
    );
    if (!res || !res.data) {
      return {
        totalFeedbacks: 0,
        positiveCount: 0,
        negativeCount: 0,
        helpfulnessPercentage: 0,
        totalGDBEntriesEvaluated: 0,
        totalFlaggedEntries: 0,
      };
    }
    return res.data;
  }

  static async getBreakdowns(filters: Partial<IFeedbackFilterState>): Promise<{
    domains: IDomainBreakdown[];
    languages: ILanguageBreakdown[];
    states: IStateBreakdown[];
  }> {
    const params = this.buildQueryParams(filters);
    const res = await apiFetch<{
      success: boolean;
      data: {
        domains: IDomainBreakdown[];
        languages: ILanguageBreakdown[];
        states: IStateBreakdown[];
      };
    }>(`${this.baseUrl}/breakdowns?${params.toString()}`);
    if (!res || !res.data) {
      return { domains: [], languages: [], states: [] };
    }
    return res.data;
  }

  static async getGDBSummaries(filters: Partial<IFeedbackFilterState>): Promise<{
    summaries: IGDBFeedbackSummary[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
      hasNextPage: boolean;
      hasPrevPage: boolean;
    };
  }> {
    const params = this.buildQueryParams(filters);
    const res = await apiFetch<{
      success: boolean;
      data: IGDBFeedbackSummary[];
      pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPrevPage: boolean;
      };
    }>(`${this.baseUrl}/gdb-summaries?${params.toString()}`);
    if (!res || !res.data) {
      return {
        summaries: [],
        pagination: {
          page: 1,
          limit: 15,
          total: 0,
          totalPages: 1,
          hasNextPage: false,
          hasPrevPage: false,
        },
      };
    }
    return {
      summaries: res.data,
      pagination: res.pagination,
    };
  }

  static async triggerAutoFlagging(threshold = 60, minResponses = 10): Promise<any> {
    const res = await apiFetch<{ success: boolean; data: any }>(
      `${this.baseUrl}/trigger-flagging`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ thresholdPercentage: threshold, minResponses }),
      }
    );
    return res?.data;
  }

  static async flagGDBEntryManually(questionId: string, reason?: string): Promise<void> {
    await apiFetch<{ success: boolean; message: string }>(
      `${this.baseUrl}/flag-manual`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, reason }),
      }
    );
  }

  static async submitFeedback(payload: {
    questionId: string;
    rating: 1 | 2;
    phoneNumber?: string;
    queryText?: string;
    deliveredAnswer?: string;
    domain?: string;
    crop?: string;
    state?: string;
    language?: string;
    feedbackText?: string;
  }): Promise<any> {
    const res = await apiFetch<{ success: boolean; data: any }>(
      `${this.baseUrl}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    return res?.data;
  }

  static async getWeeklyDigest(): Promise<IWeeklyDigestReport | null> {
    const res = await apiFetch<{ success: boolean; data: IWeeklyDigestReport }>(
      `${this.baseUrl}/weekly-digest`
    );
    return res?.data || null;
  }
}
