import { apiFetch, getCurrentUser } from "../api/api-fetch";
import { getIdToken } from "firebase/auth";
import { env } from "@/config/env";
import { libraryDocumentUrl } from "@/features/gdb-cleaning/libraryDocument";
import type {
  GdbStatus,
  IGdbHistoryEntry,
  IGdbCleaningItem,
  IGdbDraft,
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

  async saveCorrection(answerId: string, questionId: string, correctedAnswer: string): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/correction`, {
      method: "PUT",
      body: JSON.stringify({ questionId, correctedAnswer }),
    });
    if (!response) throw new Error("Failed to save the correction: No response received");
    return response;
  }

  // drafts from the library; nothing is saved until the reviewer saves the correction or sources
  async draftFromLibrary(answerId: string): Promise<IGdbDraft> {
    const response = await apiFetch<IGdbDraft>(`${this._baseUrl}/${answerId}/draft`, { method: "POST" });
    if (!response) throw new Error("Failed to draft from the library: No response received");
    return response;
  }

  // opens a cited library document at the cited page in a new tab
  async openLibraryDocument(documentId: string, page?: number): Promise<void> {
    // the tab opens straight away, on the click, so the browser does not block it while the file loads
    const tab = window.open("", "_blank");
    try {
      const user = await getCurrentUser();
      const token = user ? await getIdToken(user) : null;
      const response = await fetch(libraryDocumentUrl(documentId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        throw new Error(
          response.status === 404 ? "This library document is not available." : `Could not open the document (${response.status}).`
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const target = page ? `${url}#page=${page}` : url;
      if (tab) tab.location.href = target;
      else window.location.href = target;
    } catch (error) {
      tab?.close();
      throw error;
    }
  }

  async editFlag(answerId: string, edit: IGdbFlagEdit): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/flags`, {
      method: "PUT",
      body: JSON.stringify(edit),
    });
    if (!response) throw new Error("Failed to save the flag: No response received");
    return response;
  }

  async editSources(answerId: string, questionId: string, sources: IGdbSource[]): Promise<IGdbCleaningItem> {
    const response = await apiFetch<IGdbCleaningItem>(`${this._baseUrl}/${answerId}/sources`, {
      method: "PUT",
      body: JSON.stringify({ questionId, sources }),
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
