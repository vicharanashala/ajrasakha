import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

export interface PolishDraftPayload {
  question: string;
  draft: string;
}

export interface GuardrailInfo {
  status: string;
  confirmedChange: boolean;
  details: unknown[];
  disclaimer?: string;
}

export interface LanguagePolishingResult {
  status: "suggested" | "rejected" | "unavailable";
  suggestedText?: string | null;
  reason?: string | null;
  guardrail?: GuardrailInfo;
}

export interface StructuralValidationStep {
  slNo: number;
  step: string;
  coverage: "covered" | "partial" | "missing";
  example?: string | null;
  suggestion1?: string | null;
  suggestion2?: string | null;
}

export interface MatchedReference {
  sourceType?: string;
  domain?: string;
  code?: string;
}

export interface StructuralValidationResult {
  status:
    | "complete"
    | "partial"
    | "incomplete"
    | "needs_clarification"
    | "reference_data_unavailable";
  matchedReference?: MatchedReference | null;
  steps?: StructuralValidationStep[];
  clarificationReason?: string | null;
  orderWarnings?: string[];
}

export interface PolishDraftResponse {
  requestId: string;
  languagePolishing: LanguagePolishingResult;
  structuralValidation: StructuralValidationResult;
  warnings?: string[];
  errors?: string[];
}

export interface PolishDraftSubmitResponse {
  jobId: string;
  status: string;
}

export interface PolishDraftJobResponse {
  jobId: string;
  status: "processing" | "completed" | "failed";
  result?: PolishDraftResponse;
  error?: string;
  createdAt?: string;
  completedAt?: string;
}

const API_BASE_URL = env.apiBaseUrl();

export class WritingAssistantService {
  private _baseUrl = `${API_BASE_URL}/answers`;

  async submitPolishDraft(payload: PolishDraftPayload): Promise<PolishDraftSubmitResponse> {
    try {
      const data = await apiFetch<PolishDraftSubmitResponse>(`${this._baseUrl}/polish-draft`, {
        method: "POST",
        body: JSON.stringify({
          question: payload.question,
          draft: payload.draft,
        }),
      });

      if (!data?.jobId) {
        throw new Error("No job ID returned from Writing Assistant service");
      }

      return data;
    } catch (error: any) {
      console.error("Error in WritingAssistantService.submitPolishDraft:", error);
      throw error;
    }
  }

  async getPolishDraftJob(jobId: string): Promise<PolishDraftJobResponse> {
    try {
      const data = await apiFetch<PolishDraftJobResponse>(`${this._baseUrl}/polish-draft/${jobId}`, {
        method: "GET",
      });

      if (!data?.jobId) {
        throw new Error(`Failed to retrieve job status for ${jobId}`);
      }

      return data;
    } catch (error: any) {
      console.error(`Error in WritingAssistantService.getPolishDraftJob(${jobId}):`, error);
      throw error;
    }
  }

  /**
   * Backward-compatible synchronous-like helper (if needed)
   */
  async polishDraft(payload: PolishDraftPayload): Promise<PolishDraftResponse> {
    const { jobId } = await this.submitPolishDraft(payload);
    // Poll until completion
    const startTime = Date.now();
    const timeoutMs = 300000; // 5 minutes

    while (Date.now() - startTime < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const job = await this.getPolishDraftJob(jobId);
      if (job.status === "completed" && job.result) {
        return job.result;
      }
      if (job.status === "failed") {
        throw new Error(job.error || "Draft analysis failed");
      }
    }
    throw new Error("Draft analysis timed out after 5 minutes");
  }
}
