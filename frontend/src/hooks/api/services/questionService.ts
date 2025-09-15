import type { IQuestion } from "@/types";
import { apiFetch } from "../api-fetch";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class QuestionService {
  private _baseUrl = `${API_BASE_URL}/questions`;

  async getAllQuestions(
    pageParam: number,
    limit: number
  ): Promise<IQuestion[] | null> {
    return apiFetch<IQuestion[] | null>(
      `${this._baseUrl}?page=${pageParam}&limit=${limit}`
    );
  }

  async getQuestionById(id: string): Promise<IQuestion | null> {
    return apiFetch<IQuestion | null>(`${this._baseUrl}/${id}`);
  }
}
