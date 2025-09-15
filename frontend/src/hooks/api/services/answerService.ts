import type { ISubmissions, SubmitAnswerResponse } from "@/types";
import { apiFetch } from "../api-fetch";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class AnswerService {
  private _baseUrl = `${API_BASE_URL}/answers`;

  async submitAnswer(
    questionId: string,
    answer: string
  ): Promise<SubmitAnswerResponse | null> {
    try {
      return await apiFetch<SubmitAnswerResponse>(this._baseUrl, {
        method: "POST",
        body: JSON.stringify({ answer, questionId }),
      });
    } catch (error) {
      console.error(`Error in submitAnswer(${questionId}):`, error);
      throw error;
    }
  }

  async getSubmissions(
    pageParam: number,
    limit: number
  ): Promise<ISubmissions[] | null> {
    return apiFetch<ISubmissions[] | null>(
      `${this._baseUrl}/submissions?page=${pageParam}&limit=${limit}`
    );
  }
}
