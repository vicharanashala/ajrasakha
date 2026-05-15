import { apiFetch } from "../../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface CallHistoryItem {
  uuid: string;
  from: string;
  to: string;
  duration: number;
  status: string;
  startTime: string;
  direction: string;
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

export class PlivoService {
  private _baseUrl = `${API_BASE_URL}/plivo`;

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
}

export const plivoService = new PlivoService();

// Export backward-compatible alias
export const plivoApi = plivoService;
