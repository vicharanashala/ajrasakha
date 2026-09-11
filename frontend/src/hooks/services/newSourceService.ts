import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type { PopRequiredField } from "./popService";

const API_BASE_URL = env.apiBaseUrl();

export type PopMatchStatus = "duplicateMatch" | "topLevelMatch" | "notFound";

// organization and source are references (the Organization document's and the matched
// pop_unique_documents document's own _ids) rather than copies of their data - anything
// else about them is looked up from those documents when displaying a record, not stored
// here. page is manually entered by the reviewer, since it isn't part of either
// referenced document. sourceIndex is that source's position in the *answer's own*
// `sources` array (in the answers collection), so a reviewer can map this entry back to it.
export interface NewSourceItem {
  // The Organization document's own _id.
  organization?: string;
  // The matched pop_unique_documents document's own _id.
  source?: string;
  page?: number[];
  sourceReferenceStatus: PopMatchStatus | null;
  sourceIndex: number;
  // Which of year_of_release/live_source_link/shareable_name were identified as missing
  // on the matched pop_unique_documents document when this source was fetched - empty
  // when nothing was missing.
  missedFields?: PopRequiredField[];
  // Populated for display only (getByAnswerId, used by the moderator Before/After view) -
  // never sent when saving.
  organizationName?: string;
  organizationType?: string;
  sourceName?: string;
  // The matched document's live_source_link.
  originalLink?: string | null;
  // The matched document's own shareable_link (the Annam.AI archive).
  archivedLink?: string | null;
  yearOfRelease?: string | number | null;
}

export type NewSourceStatus =
  | "pending"
  | "review-completed"
  | "moderator-in-review"
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

// One incomplete pop document hit during a stint: which required fields were blank on
// it (before) and what the reviewer saved onto them (after, empty while unfilled).
export interface MissingPopDocument {
  popId: string;
  missingFields: PopRequiredField[];
  updatedFields?: Partial<Record<PopRequiredField, string>>;
}

export type RecordMissingPopDocumentPayload = MissingPopDocument;

export interface NewSourceReviewEntry {
  userId: string;
  name: string;
  /** Absent on entries written before moderator review existed - those were experts. */
  role?: "expert" | "moderator";
  startedAt: string;
  closedAt: string | null;
  // True once this stint actually did something - an expert saving their edit, or a
  // moderator acting on the record.
  isActionTaken: boolean;
  // The pop documents this stint found incomplete, with what was blank and what was
  // filled in - absent when nothing was missing.
  missingPopDocuments?: MissingPopDocument[];
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

  /** Called when the user saves — stops the timer and marks the record 'review-completed'. */
  async complete(
    id: string,
    payload: CompleteNewSourcePayload,
  ): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  /** Called as soon as a fetched pop document is found to be missing required fields,
   *  and again with the saved values once the reviewer fills them in — logged on this
   *  reviewer's own stint, so the gap is auditable even if the edit is never saved. */
  async recordMissingPopDocument(
    answerId: string,
    payload: RecordMissingPopDocumentPayload,
  ): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(
      `${this._baseUrl}/by-answer/${answerId}/missing-fields`,
      {
        method: "PATCH",
        body: JSON.stringify(payload),
      },
    );
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
  /** Moderator/admin opening an answer - takes it into 'moderator-in-review'. */
  async startModeratorReview(
    payload: StartNewSourcePayload,
  ): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/moderator-review`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /** The answer this moderator is already holding elsewhere, if any. */
  async findActiveModeratorReview(
    excludeAnswerId: string,
  ): Promise<NewSourceRecord | null> {
    const params = new URLSearchParams({ excludeAnswerId });
    return apiFetch<NewSourceRecord | null>(
      `${this._baseUrl}/moderator-review/active?${params.toString()}`,
    );
  }

  /** Hands the hold back so another moderator can take the answer. */
  async releaseModeratorReview(id: string): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(
      `${this._baseUrl}/${id}/moderator-review/release`,
      { method: "PATCH" },
    );
  }

  async release(id: string): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/${id}/release`, {
      method: "PATCH",
    });
  }

  /** Read-only lookup of an answer's updated_sources record, for the moderator
   *  before/after comparison view. Null when no one has reviewed this answer yet. */
  async getByAnswerId(answerId: string): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord | null>(`${this._baseUrl}/by-answer/${answerId}`);
  }

  /** Admin/moderator override of a record's status to 'pending', 'merged' or 'flagged',
   *  with a mandatory reason stored on the record's statusChanges. */
  async changeStatus(
    id: string,
    payload: {
      status: "pending" | "merged" | "flagged" | "review-completed";
      reason: string;
    },
  ): Promise<NewSourceRecord | null> {
    return apiFetch<NewSourceRecord>(`${this._baseUrl}/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }
}
