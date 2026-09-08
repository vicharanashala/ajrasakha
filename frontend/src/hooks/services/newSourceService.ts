import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface NewSourceItem {
  source: string;
  sourceType?: string;
  sourceName?: string;
  page?: string | number;
  organization?: string;
  sourceReference?: string;
}

export type NewSourceStatus = "pending" | "inProgress" | "completed";
export type PopMatchStatus = "duplicateMatch" | "topLevelMatch" | "notFound";

export interface StartNewSourcePayload {
  answerId: string;
  questionId: string;
}

export interface CompleteNewSourcePayload {
  sources: NewSourceItem[];
  timeTaken: number;
  sourceReferenceStatus: PopMatchStatus | null;
}

export interface NewSourceReviewEntry {
  userId: string;
  name: string;
  startedAt: string;
  closedAt: string | null;
  isSaved: boolean;
}

export interface NewSourceRecord {
  _id: string;
  answerId: string;
  questionId: string;
  sources: NewSourceItem[];
  status: NewSourceStatus;
  timeTaken: number | null;
  sourceReferenceStatus: PopMatchStatus | null;
  reviewArray: NewSourceReviewEntry[];
}

export class NewSourceService {
  private _baseUrl = `${API_BASE_URL}/new-sources`;

  /** Called when the Edit Source modal opens — creates the record as 'inProgress'. */
  async start(payload: StartNewSourcePayload): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** Called when the user saves — stops the timer and marks the record 'completed'. */
  async complete(
    id: string,
    payload: CompleteNewSourcePayload,
  ): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  /** Called whenever the Edit Source modal closes, completed or not — stamps closedAt
   *  on the record's reviewArray entry. */
  async close(id: string): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/${id}/close`, {
      method: "PATCH",
    });
  }
}
