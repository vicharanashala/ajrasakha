import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export type PopMatchStatus = "duplicateMatch" | "topLevelMatch" | "notFound";

// organization and sourceReferenceStatus are per source - each source on an answer can
// belong to a different organization and is checked against the pop collection on its
// own. sourceIndex is that source's position in the *answer's own* `sources` array (in
// the answers collection), so a reviewer can map this entry back to it.
export interface NewSourceItem {
  source: string;
  sourceType?: string;
  sourceName?: string;
  page?: string | number;
  organization?: string;
  sourceReference?: string;
  sourceReferenceStatus: PopMatchStatus | null;
  sourceIndex: number;
}

export type NewSourceStatus =
  | "pending"
  | "completed"
  | "in-progress"
  | "flagged"
  | "merged";

export interface StartNewSourcePayload {
  answerId: string;
  questionId: string;
}

export interface CompleteNewSourcePayload {
  sources: NewSourceItem[];
  timeTaken: number;
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
  reviewArray: NewSourceReviewEntry[];
}

export class NewSourceService {
  private _baseUrl = `${API_BASE_URL}/new-sources`;

  /** Called when the Edit Source modal opens — creates the record as 'in-progress'. */
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
