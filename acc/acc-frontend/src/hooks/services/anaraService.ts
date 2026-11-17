import { env } from "@/config/env";
import { apiFetch, getCurrentUser } from "../api/api-fetch";
import { getIdToken } from "firebase/auth";

export interface AnaraCitation {
  passageNumber: number;
  documentName: string | null;
  documentId: string | null;
  pageNumber: number | null;
  sourcePages: number[];
  passageId: string | null;
}

export interface AnaraDraftResponse {
  answer: string;
  citations: AnaraCitation[];
  note: string;
}

export interface SubmitForReviewParams {
  callUuid: string;
  question: string;
  answer: string;
  citations?: AnaraCitation[];
  crop?: string | null;
  state?: string | null;
  district?: string | null;
  block?: string | null;
  village?: string | null;
  season?: string | null;
  domain?: string | string[] | null;
}

export interface SubmitForReviewResult {
  success: boolean;
  queryId: string;
  reviewQuestionId?: string;
  reviewStatus: string;
  reviewSlaExpiresAt?: string;
  message: string;
}

export interface AiDraftFollowUpItem {
  _id?: string;
  callUuid: string;
  type?: 'GDB' | 'AI-drafted';
  question: string;
  answer: string;
  citations?: AnaraCitation[];
  reviewQuestionId?: string;
  reviewStatus?: 'not_submitted' | 'pending_review' | 'approved' | 'rejected' | 'submission_failed';
  reviewSlaExpiresAt?: string;
  reviewedAnswer?: string;
  reviewedSources?: any[];
  reviewedBy?: string;
  reviewedAt?: string;
  farmerFollowUpStatus?: 'pending' | 'called' | 'resolved';
  farmerFollowUpAt?: string;
  farmerFollowUpNotes?: string;
  createdAt?: string;
  from?: string;
  metadata?: {
    extracted_crop?: string;
    extracted_state?: string;
    extracted_district?: string;
    extracted_block?: string;
    extracted_village?: string;
    extracted_season?: string;
    [key: string]: any;
  };
}

const API_BASE_URL = env.apiBaseUrl();

export class AnaraService {
  private readonly baseUrl = `${API_BASE_URL}/anara`;

  /**
   * Drafts an answer grounded in the POP library with passage citations.
   * Timeout set to 180s to accommodate LLM reasoning and retrieval.
   */
  async draft(
    question: string,
    crop?: string | null,
    domain?: string | null,
    state?: string | null,
  ): Promise<AnaraDraftResponse> {
    const result = await apiFetch<AnaraDraftResponse>(
      `${this.baseUrl}/draft`,
      {
        method: "POST",
        body: JSON.stringify({
          question,
          crop: crop || null,
          domain: domain || null,
          state: state || null,
        }),
      },
      180000
    );

    if (!result) {
      throw new Error("Failed to generate AI draft: No response received");
    }

    return result;
  }

  /**
   * Opens a cited library document PDF at the cited page in a new browser tab.
   */
  async openLibraryPdf(documentId: string, page?: number): Promise<void> {
    const newTab = window.open("", "_blank");
    try {
      const user = await getCurrentUser();
      const token = user ? await getIdToken(user) : null;
      const pdfUrl = `${this.baseUrl}/documents/${encodeURIComponent(documentId)}/pdf`;

      const response = await fetch(pdfUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "The cited library document is not available."
            : `Could not open the library document (${response.status})`
        );
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const destination = page ? `${objectUrl}#page=${page}` : objectUrl;

      if (newTab) {
        newTab.location.href = destination;
      } else {
        window.location.href = destination;
      }
    } catch (error) {
      newTab?.close();
      throw error;
    }
  }

  getLibraryPdfUrl(documentId: string): string {
    return `${this.baseUrl}/documents/${encodeURIComponent(documentId)}/pdf`;
  }

  /**
   * Submits an AI-drafted answer to the Review System for Moderator verification.
   * Persists to call_queries as type: 'AI-drafted' and initiates the 2-hour SLA.
   */
  async submitForReview(params: SubmitForReviewParams): Promise<SubmitForReviewResult> {
    const result = await apiFetch<SubmitForReviewResult>(
      `${this.baseUrl}/submit-for-review`,
      {
        method: "POST",
        body: JSON.stringify(params),
      },
      45000
    );

    if (!result) {
      throw new Error("Failed to submit draft for review: No response from server");
    }

    return result;
  }

  /**
   * Retries submission to Review System for a query that previously failed.
   */
  async retryReviewSubmission(queryId: string): Promise<SubmitForReviewResult> {
    const result = await apiFetch<SubmitForReviewResult>(
      `${this.baseUrl}/retry-submission/${encodeURIComponent(queryId)}`,
      {
        method: "POST",
      },
      45000
    );

    if (!result) {
      throw new Error("Failed to retry submission: No response from server");
    }

    return result;
  }

  /**
   * Fetches active AI draft follow-ups (approved by Moderator or under review).
   */
  async getFollowUps(
    status?: string,
    followUpStatus?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ queries: AiDraftFollowUpItem[]; total: number }> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (followUpStatus) params.set("followUpStatus", followUpStatus);
    if (limit) params.set("limit", String(limit));
    if (offset) params.set("offset", String(offset));

    const url = `${this.baseUrl}/follow-ups${params.toString() ? `?${params.toString()}` : ""}`;
    const result = await apiFetch<{ queries: AiDraftFollowUpItem[]; total: number }>(
      url,
      { method: "GET" },
      15000
    );

    return result || { queries: [], total: 0 };
  }

  /**
   * Updates follow-up status (e.g. 'called', 'resolved') after contacting farmer.
   */
  async updateFollowUpStatus(
    queryId: string,
    status: 'pending' | 'called' | 'resolved',
    notes?: string
  ): Promise<void> {
    await apiFetch(
      `${this.baseUrl}/follow-ups/${encodeURIComponent(queryId)}`,
      {
        method: "PATCH",
        body: JSON.stringify({ status, notes }),
      },
      15000
    );
  }
}

export const anaraService = new AnaraService();

