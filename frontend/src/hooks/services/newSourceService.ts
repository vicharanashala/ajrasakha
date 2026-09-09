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
  // Seconds spent on this reviewer's own edit, set once they save. A record can carry
  // more than one entry (different experts pick it up over time, e.g. after a release
  // back to 'pending'), each with its own timeTaken.
  timeTaken: number | null;
}

export interface NewSourceStatusChange {
  status: NewSourceStatus;
  reason: string;
  changedBy: string;
  changedByName: string;
  changedAt: string;
}

export interface NewSourceRecord {
  _id: string;
  answerId: string;
  questionId: string;
  sources: NewSourceItem[];
  status: NewSourceStatus;
  timeTaken: number | null;
  reviewArray: NewSourceReviewEntry[];
  statusChanges?: NewSourceStatusChange[];
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

  /** Called before starting a new edit session — finds this user's other 'in-progress'
   *  record, if any, so switching answers can be confirmed first. */
  async findActiveInProgress(excludeAnswerId: string): Promise<NewSourceRecord | null> {
    const params = new URLSearchParams({ excludeAnswerId });
    return apiFetch<NewSourceRecord | null>(`${this._baseUrl}/active?${params.toString()}`);
  }

  /** Called once the user confirms switching answers — sends the previous 'in-progress'
   *  record back to 'pending' so another expert can pick it up. */
  async release(id: string): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/${id}/release`, {
      method: "PATCH",
    });
  }

  /** Read-only lookup of an answer's new_sources record, for the moderator
   *  before/after comparison view. Null when no one has reviewed this answer yet. */
  async getByAnswerId(answerId: string): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord | null>(`${this._baseUrl}/by-answer/${answerId}`);
  }

  /** Admin/moderator override of a record's status to 'pending', 'merged' or 'flagged',
   *  with a mandatory reason stored on the record's statusChanges. */
  async changeStatus(
    id: string,
    payload: { status: "pending" | "merged" | "flagged"; reason: string },
  ): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
}
