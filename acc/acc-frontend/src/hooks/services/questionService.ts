import { env } from "@/config/env";
import { apiFetch } from "../api/api-fetch";

export interface GeneratedQuestion {
  id: string;
  question: string;
  agri_specialist: string;
  answer: string;
  referenceSource: string;
}

const API_BASE_URL = env.apiBaseUrl();

export class QuestionService {
  private _baseUrl = `${API_BASE_URL}/questions`;

  async generateQuestionsFromCallContext(query: string, state?: string, crop?: string): Promise<GeneratedQuestion[] | null> {
    return apiFetch<GeneratedQuestion[] | null>(`${this._baseUrl}/generate-by-call-context`, {
      method: "POST",
      body: JSON.stringify({ query, state, crop }),
    });
  }
}
