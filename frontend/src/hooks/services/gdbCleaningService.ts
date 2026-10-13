import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type {
  GdbStatus,
  IGdbCleaningItem,
  IGdbListItem,
} from "@/features/gdb-cleaning/types";

const API_BASE_URL = env.apiBaseUrl();

export interface IGdbListParams {
  search?: string;
  states?: string[];
  crops?: string[];
  flags?: string[];
  statuses?: GdbStatus[];
  page?: number;
  limit?: number;
}

export interface IGdbListResponse {
  items: IGdbListItem[];
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
}

export type IGdbSummary = Record<GdbStatus, number> & { total: number };

export interface IGdbFilterOptions {
  states: string[];
  crops: string[];
  flags: string[];
}

export interface IGdbDecisionRequest {
  action: "accept" | "dismiss";
  correctedAnswer?: string;
  comment?: string;
}

class GdbCleaningService {
  private _baseUrl = `${API_BASE_URL}/gdb-cleaning`;

  async list(params: IGdbListParams): Promise<IGdbListResponse> {
    const query = new URLSearchParams();
    if (params.search) query.append("search", params.search);
    for (const key of ["states", "crops", "flags", "statuses"] as const) {
      const values = params[key];
      values?.forEach((value) => query.append(key, value));
    }
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());

    const response = await apiFetch<IGdbListResponse>(`${this._baseUrl}?${query.toString()}`);
    if (!response) throw new Error("Failed to load answers: No response received");
    return response;
  }

  async summary(): Promise<IGdbSummary> {
    const response = await apiFetch<IGdbSummary>(`${this._baseUrl}/summary`);
    if (!response) throw new Error("Failed to load the summary: No response received");
    return response;
  }

  async filters(): Promise<IGdbFilterOptions> {
    const response = await apiFetch<IGdbFilterOptions>(`${this._baseUrl}/filters`);
    if (!response) throw new Error("Failed to load the filters: No response received");
    return response;
  }

  async get(answerId: string): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}`);
    if (!response) throw new Error("Failed to load the answer: No response received");
    return response;
  }

  async saveCorrection(answerId: string, correctedAnswer: string): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/correction`, {
      method: "PUT",
      body: JSON.stringify({ correctedAnswer }),
    });
    if (!response) throw new Error("Failed to save the correction: No response received");
    return response;
  }

  async decide(answerId: string, decision: IGdbDecisionRequest): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/decision`, {
      method: "POST",
      body: JSON.stringify(decision),
    });
    if (!response) throw new Error("Failed to save the decision: No response received");
    return response;
  }
}

export const gdbCleaningService = new GdbCleaningService();
