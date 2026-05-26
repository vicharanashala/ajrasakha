import { env } from '@/config/env';
import { auth } from '@/config/firebase';
import type { GrowthResponse } from '@/types';
import { getIdToken } from 'firebase/auth';
import { apiFetch } from '../api/api-fetch';

const API_BASE_URL = env.apiBaseUrl();

export class ChatbotService {
  private _baseUrl = `${API_BASE_URL}/analytics`;
  private _whatsAppBaseUrl = `${API_BASE_URL}/whatsapp`;
  async downloadChatbotReport(
    startDate: string,
    endDate: string,
    source = 'vicharanashala',
    downloadFormat: string,
    state: string
  ): Promise<Blob> {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    const token = await getIdToken(user);
    const params = new URLSearchParams({ startDate, endDate, source, downloadFormat, state });
    const response = await fetch(
      `${this._baseUrl}/download-chatbot-report?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as any)?.message ?? 'Download failed');
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      const json = await response.json();
      throw new Error(json?.message ?? 'No data found for the selected date range');
    }
    return response.blob();
  }

  async getUserGrowth(source:string, range: number): Promise<GrowthResponse | null> {
    const params = new URLSearchParams();

    if (range) params.append("range", range.toString());
    params.append("source", source);

    return apiFetch<GrowthResponse>(`${this._baseUrl}/user-growth?${params.toString()}`);
  }

  async getUserGrowthByDateRange(
    source: string,
    startDate: string,
    endDate: string,
  ): Promise<GrowthResponse | null> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    params.append("source", source);

    return apiFetch<GrowthResponse>(`${this._baseUrl}/user-growth?${params.toString()}`);
  }

  async getDailyActiveUsersTrend(
    startDate: string,
    endDate: string,
    source: string,
    userType: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    params.append("source", source);
    params.append("userType", userType);
      return apiFetch<any>(
      `${this._baseUrl}/daily-active-users-trend?${params.toString()}`,
    );
  }

  async getMonthlyActiveUsersTrend(
    startDate: string,
    endDate: string,
    source: string,
    userType: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
      params.append("source", source);
      params.append("userType", userType);
    return apiFetch<any>(
      `${this._baseUrl}/monthly-active-users-trend?${params.toString()}`,
    );
  }

  async getWeeklyActiveUsersTrend(
    startDate: string,
    endDate: string,
    source: string,
    userType: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
      params.append("source", source);
      params.append("userType", userType);
    return apiFetch<any>(
      `${this._baseUrl}/weekly-active-users-trend?${params.toString()}`,
    );
  }

  async getRetentionMetrics(
    startDate: string,
    endDate: string,
    source: string,
    userType: string,
    requestType: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("startDate", startDate);
    params.append("endDate", endDate);
    params.append("source", source);
    params.append("userType", userType);
    params.append("requestType", requestType);
    return apiFetch<any>(`${this._baseUrl}/retention-metrics?${params.toString()}`);
  }

  async getQueryCategories(
    source: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("source", source);
    return apiFetch<any>(
      `${this._baseUrl}/query-categories?${params.toString()}`,
    );
  }

  async getInactiveWhatsappUsers(
    inactiveUsersPage: number
  ): Promise<any> {
    return apiFetch<any>(
      `${this._whatsAppBaseUrl}/inactive-users?page=${inactiveUsersPage}&limit=10`,
    );
  }

  async getUniqueWhatsappUsers(
  ): Promise<any> {
    return apiFetch<any>(
      `${this._whatsAppBaseUrl}/unique-users`,
    );
  }

  async getClosedAndNotifedData(source: string): Promise<any>{
    const params = new URLSearchParams();
    params.append("source", source);
    return apiFetch<any>(
      `${this._baseUrl}/closed-notified-data?${params.toString()}`,
    );
  }
}
