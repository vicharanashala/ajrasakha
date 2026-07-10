import { env } from "@/config/env";
import { auth } from "@/config/firebase";
import type { GrowthResponse } from "@/types";
import { getIdToken } from "firebase/auth";
import { apiFetch } from "../api/api-fetch";

const API_BASE_URL = env.apiBaseUrl();

export class ChatbotService {
  private _baseUrl = `${API_BASE_URL}/analytics`;
  private _whatsAppBaseUrl = `${API_BASE_URL}/whatsapp`;
  async downloadChatbotReport(
    startDate: string,
    endDate: string,
    source = "vicharanashala",
    downloadFormat: string,
    state: string,
  ): Promise<Blob> {
    const user = auth.currentUser;
    if (!user) throw new Error("Not authenticated");
    const token = await getIdToken(user);
    const params = new URLSearchParams({
      startDate,
      endDate,
      source,
      downloadFormat,
      state,
    });
    const response = await fetch(
      `${this._baseUrl}/download-chatbot-report?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any)?.message ?? "Download failed");
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const json = await response.json();
      throw new Error(
        json?.message ?? "No data found for the selected date range",
      );
    }
    return response.blob();
  }

  async getUserGrowth(
    source: string,
    userType: string,
    range: number,
  ): Promise<GrowthResponse | null> {
    const params = new URLSearchParams();

    if (range) params.append("range", range.toString());
    params.append("source", source);
    params.append("userType", userType)

    return apiFetch<GrowthResponse>(
      `${this._baseUrl}/user-growth?${params.toString()}`,
    );
  }

  async getUserGrowthByDateRange(
    source: string,
    userType: string,
    startDate: string,
    endDate: string,
  ): Promise<GrowthResponse | null> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    params.append("source", source);
    params.append("userType", userType);

    return apiFetch<GrowthResponse>(
      `${this._baseUrl}/user-growth?${params.toString()}`,
    );
  }

  async getDailyActiveUsersTrend(
    source: string,
    userType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) {
      params.append("startDate", startDate);
    }

    if (endDate) {
      params.append("endDate", endDate);
    }
    params.append("source", source);
    params.append("userType", userType);
    return apiFetch<any>(
      `${this._baseUrl}/daily-active-users-trend?${params.toString()}`,
    );
  }

  async getMonthlyActiveUsersTrend(
    source: string,
    userType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) {
      params.append("startDate", startDate);
    }

    if (endDate) {
      params.append("endDate", endDate);
    }
    params.append("source", source);
    params.append("userType", userType);
    return apiFetch<any>(
      `${this._baseUrl}/monthly-active-users-trend?${params.toString()}`,
    );
  }

  async getWeeklyActiveUsersTrend(
    source: string,
    userType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) {
      params.append("startDate", startDate);
    }

    if (endDate) {
      params.append("endDate", endDate);
    }
    params.append("source", source);
    params.append("userType", userType);
    return apiFetch<any>(
      `${this._baseUrl}/weekly-active-users-trend?${params.toString()}`,
    );
  }

  async getRetentionMetrics(
    source: string,
    userType: string,
    requestType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) {
      params.append("startDate", startDate);
    }

    if (endDate) {
      params.append("endDate", endDate);
    }
    params.append("source", source);
    params.append("userType", userType);
    params.append("requestType", requestType);
    return apiFetch<any>(
      `${this._baseUrl}/retention-metrics?${params.toString()}`,
    );
  }

  async getQueryCategories(source: string, userType: string): Promise<any> {
    const params = new URLSearchParams();
    params.append("source", source);
    params.append("userType", userType);
    return apiFetch<any>(
      `${this._baseUrl}/query-categories?${params.toString()}`,
    );
  }

  // async getQueryCategoryQuestions({
  //   category,
  //   questionType,
  //   page,
  //   limit,
  //   source,
  //   userType,
  // }: {
  //   category: string;
  //   questionType: "all" | "unique" | "duplicate";
  //   page: number;
  //   limit: number;
  //   source: string;
  //   userType?: string;
  // }): Promise<any> {
  //   const params = new URLSearchParams();
  //   params.append("category", category);
  //   params.append("questionType", questionType);
  //   params.append("page", page.toString());
  //   params.append("limit", limit.toString());
  //   params.append("source", source);
  //   if (userType) params.append("userType", userType);

  //   return apiFetch<any>(
  //     `${this._baseUrl}/query-category-questions?${params.toString()}`,
  //   );
  // }

  //   async getDistrictQuestions({
  //   district,
  //   questionType,
  //   page,
  //   limit,
  //   source,
  //   userType,
  // }: {
  //   district: string;
  //   questionType: "all" | "unique" | "duplicate";
  //   page: number;
  //   limit: number;
  //   source: string;
  //   userType?: string;
  // }): Promise<any> {
  //   const params = new URLSearchParams();
  //   params.append("district", district);
  //   params.append("questionType", questionType);
  //   params.append("page", page.toString());
  //   params.append("limit", limit.toString());
  //   params.append("source", source);
  //   if (userType) params.append("userType", userType);

  //   return apiFetch<any>(
  //     `${this._baseUrl}/district-questions?${params.toString()}`,
  //   );
  // }

  async getQuestionByFilters({
    category,
    district,
    state,
    crop,
    crops,
    status,
    closedWithInTwohours,
    notificationType,
    period,
    questionType,
    page,
    limit,
    source,
    userType,
    stringStartDate,
    stringEndDate,
    search,
    isPassed,
    tag
  }: {
    category?: string;
    district?: string;
    state?: string;
    crop?: string;
    crops?: string[];
    status?: string;
    closedWithInTwohours?: boolean
    notificationType?: string
    period?: string
    questionType: "all" | "unique" | "duplicate";
    page: number;
    limit: number;
    source: string;
    userType?: string;
    stringStartDate?: string;
    stringEndDate?: string;
    search?: string;
    isPassed?: boolean;
    tag?: string;
  }) {
    const params = new URLSearchParams();
    if (category) params.append("category", category);
    if (district) params.append("district", district);
    if (state) params.append("state", state);
    if (crop) params.append("crop", crop);
    if (crops?.length) params.append("crops", crops?.join(","));
    if (status) params.append("status", status);
    if (closedWithInTwohours) params.append("closedWithInTwohours", closedWithInTwohours.toString());
    if (notificationType) params.append('notificationType', notificationType);
    if (period) params.append('period', period)
    params.append("questionType", questionType);
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    params.append("source", source);
    if (userType) params.append("userType", userType);
    if (stringStartDate) params.append("startDate", stringStartDate);
    if (stringEndDate) params.append("endDate", stringEndDate);
    if (search?.trim()) {
      params.append("search", search.trim());
    }
    if (isPassed !== undefined) {
      params.append("isPassed", String(isPassed));
    }
    if(tag){
      params.append("tag", tag)
    }
    return apiFetch<any>(
      `${this._baseUrl}/filtered-questions?${params.toString()}`,
    );
  }

  async getInactiveWhatsappUsers(inactiveUsersPage: number): Promise<any> {
    return apiFetch<any>(
      `${this._whatsAppBaseUrl}/inactive-users?page=${inactiveUsersPage}&limit=10`,
    );
  }

  async getUniqueWhatsappUsers(): Promise<any> {
    return apiFetch<any>(`${this._whatsAppBaseUrl}/unique-users`);
  }

  async getAllWhatsappUsers(): Promise<any> {
    return apiFetch<any>(`${this._whatsAppBaseUrl}/users`);
  }

  async getClosedAndNotifedData(
    source: string,
    userType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("source", source);
    params.append("userType", userType);
    if (startDate) {
      params.append("startDate", startDate);
    }
    if (endDate) {
      params.append("endDate", endDate);
    }
    return apiFetch<any>(
      `${this._baseUrl}/closed-notified-data?${params.toString()}`,
    );
  }

  async getMonthlyChurnRate(source: string, userType: string): Promise<any> {
    const params = new URLSearchParams();
    params.append("source", source);
    params.append("userType", userType);
    return apiFetch<any>(
      `${this._baseUrl}/monthly-churn-rate?${params.toString()}`,
    );
  }

  async getActiveUsersTrend(
    source: string,
    userType: string,
    requestType: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) {
      params.append("startDate", startDate);
    }

    if (endDate) {
      params.append("endDate", endDate);
    }
    params.append("source", source);
    params.append("userType", userType);
    params.append("requestType", requestType);
    return apiFetch<any>(
      `${this._baseUrl}/active-users-trend?${params.toString()}`,
    );
  }

    async getAllStatesQuestionsAndUsersData({
    // category,
    // district,
    // state,
    // crop,
    // crops,
    // status,
    // closedWithInTwohours,
    // notificationType,
    // period,
    // questionType,
    // page,
    // limit,
    source,
    userType,
    // stringStartDate,
    // stringEndDate,
    // search,
  }: {
    // category?: string;
    // district?: string;
    // state?: string;
    // crop?: string;
    // crops?: string[];
    // status?: string;
    // closedWithInTwohours?: boolean
    // notificationType?: string
    // period?: string
    // questionType: "all" | "unique" | "duplicate";
    // page: number;
    // limit: number;
    source: string;
    userType?: string;
    // stringStartDate?: string;
    // stringEndDate?: string;
    // search?: string;
  }) {
    const params = new URLSearchParams();
    // if (category) params.append("category", category);
    // if (district) params.append("district", district);
    // if (state) params.append("state", state);
    // if (crop) params.append("crop", crop);
    // if (crops?.length) params.append("crops", crops?.join(","));
    // if (status) params.append("status", status);
    // if (closedWithInTwohours) params.append("closedWithInTwohours", closedWithInTwohours.toString());
    // if (notificationType) params.append('notificationType', notificationType);
    // if (period) params.append('period', period)
    // params.append("questionType", questionType);
    // params.append("page", page.toString());
    // params.append("limit", limit.toString());
    params.append("source", source);
    if (userType) params.append("userType", userType);
    // if (stringStartDate) params.append("startDate", stringStartDate);
    // if (stringEndDate) params.append("endDate", stringEndDate);
    // if (search?.trim()) {
    //   params.append("search", search.trim());
    // }
    return apiFetch<any>(
      `${this._baseUrl}/state-user-data?${params.toString()}`,
    );
  }

  async getVillageUserCounts({
    // category,
    state,
    district,
    // crop,
    // crops,
    // status,
    // closedWithInTwohours,
    // notificationType,
    // period,
    // questionType,
    // page,
    // limit,
    source,
    userType,
    // stringStartDate,
    // stringEndDate,
    // search,
  }: {
    // category?: string;
    state: string;
    district: string;
    // crop?: string;
    // crops?: string[];
    // status?: string;
    // closedWithInTwohours?: boolean
    // notificationType?: string
    // period?: string
    // questionType: "all" | "unique" | "duplicate";
    // page: number;
    // limit: number;
    source: string;
    userType?: string;
    // stringStartDate?: string;
    // stringEndDate?: string;
    // search?: string;
  }) {
    const params = new URLSearchParams();
    // if (category) params.append("category", category);
    params.append("state", state);
    params.append("district", district);
    // if (crop) params.append("crop", crop);
    // if (crops?.length) params.append("crops", crops?.join(","));
    // if (status) params.append("status", status);
    // if (closedWithInTwohours) params.append("closedWithInTwohours", closedWithInTwohours.toString());
    // if (notificationType) params.append('notificationType', notificationType);
    // if (period) params.append('period', period)
    // params.append("questionType", questionType);
    // params.append("page", page.toString());
    // params.append("limit", limit.toString());
    params.append("source", source);
    if (userType) params.append("userType", userType);
    // if (stringStartDate) params.append("startDate", stringStartDate);
    // if (stringEndDate) params.append("endDate", stringEndDate);
    // if (search?.trim()) {
    //   params.append("search", search.trim());
    // }
    return apiFetch<any>(
      `${this._baseUrl}/village-data?${params.toString()}`,
    );
  }

  async getQuestionLifeCycle(
    questionId: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("questionId", questionId);
    return apiFetch<any>(
      `${this._baseUrl}/question-lifecycle?${params.toString()}`,
    );
  }

  async getActiveUserDetails ({
    page,
    limit,
    source,
    userType,
    district,
    state,
    search,
  }:{
    page: number,
    limit: number,
    source:string,
    userType: string,
    district?: string,
    state?: string,
    search?: string,
  }){
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('source', source)
    params.append('userType', userType)
    if(district) params.append('district', district);
    if(state) params.append('state', state);
    if(search) params.append('search', search);
    return apiFetch<any>(`${this._baseUrl}/active-users-details?${params.toString()}`)
  }

  async getCoordinatorsDetails ({
    page,
    limit,
    source,
    userType,
    district,
    state,
    search,
  }:{
    page: number,
    limit: number,
    source:string,
    userType: string,
    district?: string,
    state?: string,
    search?: string,
  }){
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    params.append('source', source)
    params.append('userType', userType)
    if(district) params.append('district', district);
    if(state) params.append('state', state);
    if(search) params.append('search', search);
    return apiFetch<any>(`${this._baseUrl}/get-coordinators-details?${params.toString()}`)

  }
  async getLifeCycleSummary(
    startDate?: string,
    endDate?: string,
    source?: string,
    status?: string,
    userType?: string,
    isPassed?: boolean,
    tag?: string,
    notificationType?: string,
    page = 1,
    limit = 1000,
  ): Promise<any> {
    const params = new URLSearchParams();
    if (startDate) {
      params.append("startDate", startDate);
    }
    if (endDate) {
      params.append("endDate", endDate);
    }
    if (source) {
      params.append("source", source);
    }
    if (status) {
      params.append("status", status);
    }
    if (userType) {
      params.append("userType", userType);
    }
    if (isPassed != null) {
      params.append("isPassed", String(isPassed));
    }
    if (tag) {
      params.append("tag", String(tag));
    }
    if (notificationType) {
      params.append("notificationType", String(notificationType));
    }
    if(page) {
      params.append("page", String(page));
    }
    if(limit) {
      params.append("limit", String(limit));
    }

    return apiFetch<any>(
      `${this._baseUrl}/lifecycle-summary?${params.toString()}`
    );
  }

  async getFeedbackUsers({
    page,
    limit,
    search,
    sortBy,
    sortOrder,
    rating,
    tag,
    source,
    userType,
  }: {
    page: number;
    limit: number;
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    rating?: string;
    tag?: string;
    source?: string;
    userType?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    if (search) params.append("search", search);
    if (sortBy) params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);
    if (rating) {
      const apiRating = rating === 'positive' ? 'thumbsUp' : rating === 'negative' ? 'thumbsDown' : rating;
      params.append("rating", apiRating);
    }
    if (tag) params.append("tag", tag);
    if (source) params.append("source", source);
    if (userType) params.append("userType", userType);

    return apiFetch<any>(
      `${this._baseUrl}/feedback-users?${params.toString()}`
    );
  }

    async getFeedbackByLocation({
    source,
    page,
    limit,
    sortBy,
    sortOrder,
    userType,
    rating,
    state,
    district,
    search,
  }: {
    source?: string;
    page: number;
    limit: number;
    sortBy?: string;
    sortOrder?: string;
    userType?: string;
    rating?: string;
    state?: string,
    district?: string,
    search?: string;
  }): Promise<any> {
    const params = new URLSearchParams();
    if (source) params.append("source", source);
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    if (sortBy) params.append("sortBy", sortBy);
    if (sortOrder) params.append("sortOrder", sortOrder);
    if (userType) params.append("userType", userType);
    if (rating) {
      const apiRating = rating === 'positive' ? 'thumbsUp' : rating === 'negative' ? 'thumbsDown' : rating;
      params.append("rating", apiRating);
    }
    if(state) params.append('state', state);
    if(district) params.append('district', district);
    if (search) params.append("search", search);

    return apiFetch<any>(
      `${this._baseUrl}/feedback-by-location?${params.toString()}`
    );
  }
}
