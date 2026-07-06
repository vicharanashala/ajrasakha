import { apiFetch } from "../../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface QAMetadata {
  extracted_query: string;
  extracted_crop: string;
  extracted_state: string;
  extracted_district: string;
  extracted_domain: string;
  extracted_season: string;
}

export interface QAItem {
  question: string;
  answer: string;
  agri_specialist: string;
  referenceSource: string;
  id: string;
  weather?: any;
  authorName?: string;
  sourceName?: string;
  sourceLink?: string;
}

export interface QAPairs {
  metadata: QAMetadata;
  QnA: QAItem[];
}

export interface CallHistoryItem {
  uuid: string;
  from: string;
  to: string;
  duration: number;
  status: string;
  startTime: string;
  direction: string;
  callDetails?: {
    caller?: { transcript: string; translation: string; detectedLanguage: string };
    agent?: { transcript: string; translation: string; detectedLanguage: string; userid?: string };
    QA_pairs?: QAPairs;
  };
}

export interface CallHistoryResponse {
  calls: CallHistoryItem[];
  total: number;
}

export interface MakeCallRequest {
  to: string;
}

export interface MakeCallResponse {
  message: string;
  callUuid: string;
}

export interface FarmerProfile {
  farmerName?: string;
  age?: number;
  gender?: string;
  villageName?: string;
  blockName?: string;
  district?: string;
  state?: string;
  phoneNo?: string;
  languagePreference?: string;
  yearsOfExperience?: number;
  cropsCultivated?: string[];
  primaryCrop?: string;
  secondaryCrop?: string;
  awarenessOfKCC?: boolean;
  usesAgriApps?: boolean;
  highestEducatedPerson?: string;
  numberOfSmartphones?: number;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface CallFarmer {
  _id?: string;
  phoneNo: string;
  profile: FarmerProfile;
  createdAt?: string;
  updatedAt?: string;
}

export interface AgentAnalytics {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  averageDuration: number;
  domains: { domain: string; count: number }[];
  callsByStatus: { status: string; count: number }[];
  dailyCallTrend: { date: string; count: number }[];
}

export interface ACCAnalytics {
  totalCalls: number;
  callsToday: number;
  callsThisWeek: number;
  callsThisMonth: number;
  domains: { domain: string; count: number; today: number; thisWeek: number; thisMonth: number }[];
  monthlyTrend: { month: string; count: number }[];
  dailyTrend: { date: string; count: number }[];
}

export class PlivoService {
  private _baseUrl = `${API_BASE_URL}/plivo`;
  private _farmerBaseUrl = `${API_BASE_URL}/farmer`;

  async getCallHistory(params: {
    limit?: number;
    offset?: number;
    startDate?: string;
    endDate?: string;
    status?: string;
    direction?: string;
  }): Promise<CallHistoryItem[]> {
    const queryParams = new URLSearchParams();

    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    if (params.startDate) queryParams.append('startDate', params.startDate);
    if (params.endDate) queryParams.append('endDate', params.endDate);
    if (params.status) queryParams.append('status', params.status);
    if (params.direction) queryParams.append('direction', params.direction);

    const url = `${this._baseUrl}/history${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response = await apiFetch<CallHistoryItem[]>(url);

    if (!response) {
      throw new Error('Failed to fetch call history: No response received');
    }

    return response;
  }

  async getFarmerByPhoneNo(phoneNo: string): Promise<CallFarmer | null> {
    const url = `${this._farmerBaseUrl}/${encodeURIComponent(phoneNo)}`;
    try {
      const response = await apiFetch<CallFarmer>(url);
      return response;
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.getFarmerByPhoneNo: Error for phoneNo ${phoneNo}:`, error);
      throw error;
    }
  }

  async createFarmer(phoneNo: string, profile: FarmerProfile): Promise<string> {
    const url = `${this._farmerBaseUrl}`;
    try {
      const response = await apiFetch<{ id: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNo, profile }),
      });
      return response?.id || '';
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.createFarmer: Error for phoneNo ${phoneNo}:`, error);
      throw error;
    }
  }

  async updateFarmer(phoneNo: string, profile: FarmerProfile): Promise<boolean> {
    const url = `${this._farmerBaseUrl}/${encodeURIComponent(phoneNo)}`;
    try {
      const response = await apiFetch<{ success: boolean }>(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile }),
      });
      return response?.success || false;
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.updateFarmer: Error for phoneNo ${phoneNo}:`, error);
      throw error;
    }
  }

  async deleteFarmer(phoneNo: string): Promise<boolean> {
    const url = `${this._farmerBaseUrl}/${encodeURIComponent(phoneNo)}`;
    try {
      const response = await apiFetch<{ success: boolean }>(url, {
        method: 'DELETE',
      });
      return response?.success || false;
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.deleteFarmer: Error for phoneNo ${phoneNo}:`, error);
      throw error;
    }
  }

  async getAllFarmers(): Promise<CallFarmer[]> {
    const url = `${this._farmerBaseUrl}`;
    try {
      const response = await apiFetch<CallFarmer[]>(url);
      return response || [];
    } catch (error) {
      console.error(`[FARMER_FLOW] PlivoService.getAllFarmers: Error:`, error);
      throw error;
    }
  }

  async sendMessage(destination: string, text: string): Promise<{ success: boolean; messageUuid?: string }> {
    const url = `${this._baseUrl}/send-message`;
    try {
      const response = await apiFetch<{ success: boolean; messageUuid?: string }>(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ destination, text }),
      });
      return response || { success: false };
    } catch (error) {
      console.error(`PlivoService.sendMessage: Error sending message to ${destination}:`, error);
      throw error;
    }
  }

  async getAgentAnalytics(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<AgentAnalytics> {
    const queryParams = new URLSearchParams();

    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `${this._baseUrl}/analytics${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    try {
      const response = await apiFetch<AgentAnalytics>(url);

      if (!response) {
        throw new Error('Failed to fetch agent analytics: No response received');
      }

      return response;
    } catch (error) {
      console.error(`PlivoService.getAgentAnalytics: Error fetching analytics:`, error);
      throw error;
    }
  }

  async getACCAnalytics(params?: {
    startDate?: string;
    endDate?: string;
  }): Promise<ACCAnalytics> {
    const queryParams = new URLSearchParams();

    if (params?.startDate) queryParams.append('startDate', params.startDate);
    if (params?.endDate) queryParams.append('endDate', params.endDate);

    const url = `${this._baseUrl}/acc-analytics${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    try {
      const response = await apiFetch<ACCAnalytics>(url);

      if (!response) {
        throw new Error('Failed to fetch ACC analytics: No response received');
      }

      return response;
    } catch (error) {
      console.error(`PlivoService.getACCAnalytics: Error fetching analytics:`, error);
      throw error;
    }
  }
}

export const plivoService = new PlivoService();
export const plivoApi = plivoService;
