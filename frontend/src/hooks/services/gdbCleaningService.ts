import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type {
  GdbStatus,
  IGdbHistoryEntry,
  IGdbCleaningItem,
  IGdbListItem,
  IGdbSource,
} from "@/features/gdb-cleaning/types";

const API_BASE_URL = env.apiBaseUrl();

export interface IGdbListParams {
  search?: string;
  states?: string[];
  crops?: string[];
  flags?: string[];
  statuses?: GdbStatus[];
  assignee?: "me" | "unassigned";
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

// from and to are ISO times; leave both out for all time
export interface IGdbRange {
  from?: string;
  to?: string;
}

export type IGdbSummary = Record<GdbStatus, number> & { total: number; pushed: number; ranged: boolean };

export interface IGdbHistoryParams extends IGdbRange {
  scope?: "mine" | "all";
  page?: number;
  limit?: number;
}

export interface IGdbHistoryResponse {
  entries: IGdbHistoryEntry[];
  totalCount: number;
  totalPages: number;
  page: number;
  limit: number;
  answersHandled: number;
}

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

export interface IGdbFlagEdit {
  parameter: string;
  result: "PASS" | "FAIL";
  comment: string;
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
    if (params.assignee) query.append("assignee", params.assignee);
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());

    const response = await apiFetch<IGdbListResponse>(`${this._baseUrl}?${query.toString()}`);
    if (!response) throw new Error("Failed to load answers: No response received");
    return response;
  }

  async summary(range: IGdbRange = {}): Promise<IGdbSummary> {
    const query = new URLSearchParams();
    if (range.from && range.to) {
      query.append("from", range.from);
      query.append("to", range.to);
    }
    const response = await apiFetch<IGdbSummary>(`${this._baseUrl}/summary?${query.toString()}`);
    if (!response) throw new Error("Failed to load the summary: No response received");
    return response;
  }

  // tops the reviewer up to 50 answers of their own
  async refill(): Promise<{ open: number; claimed: number }> {
    const response = await apiFetch<{ open: number; claimed: number }>(`${this._baseUrl}/assignments/refill`, {
      method: "POST",
    });
    if (!response) throw new Error("Failed to get your answers: No response received");
    return response;
  }

  async release(answerId: string): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/release`, { method: "POST" });
    if (!response) throw new Error("Failed to release the answer: No response received");
    return response;
  }

  async history(params: IGdbHistoryParams): Promise<IGdbHistoryResponse> {
    const query = new URLSearchParams();
    if (params.from && params.to) {
      query.append("from", params.from);
      query.append("to", params.to);
    }
    if (params.scope) query.append("scope", params.scope);
    if (params.page) query.append("page", params.page.toString());
    if (params.limit) query.append("limit", params.limit.toString());
    const response = await apiFetch<IGdbHistoryResponse>(`${this._baseUrl}/history?${query.toString()}`);
    if (!response) throw new Error("Failed to load the history: No response received");
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

  async editFlag(answerId: string, edit: IGdbFlagEdit): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/flags`, {
      method: "PUT",
      body: JSON.stringify(edit),
    });
    if (!response) throw new Error("Failed to save the flag: No response received");
    return response;
  }

  async editSources(answerId: string, sources: IGdbSource[]): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/sources`, {
      method: "PUT",
      body: JSON.stringify({ sources }),
    });
    if (!response) throw new Error("Failed to save the sources: No response received");
    return response;
  }

  async pushToGdb(answerId: string): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/push`, { method: "POST" });
    if (!response) throw new Error("Failed to push to the golden database: No response received");
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
