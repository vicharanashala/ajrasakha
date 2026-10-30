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

const API_BASE_URL = env.apiBaseUrl();

export class WritingAssistantService {
  private _baseUrl = `${API_BASE_URL}/answers`;

  async polishDraft(payload: PolishDraftPayload): Promise<PolishDraftResponse> {
    try {
      const data = await apiFetch<PolishDraftResponse>(`${this._baseUrl}/polish-draft`, {
        method: "POST",
        body: JSON.stringify({
          question: payload.question,
          draft: payload.draft,
        }),
        timeoutMs: 120000,
      } as any);

      if (!data) {
        throw new Error("No response received from Writing Assistant service");
      }

      return data;
    } catch (error: any) {
      console.error("Error in WritingAssistantService.polishDraft:", error);
      throw error;
    }
  }
}
