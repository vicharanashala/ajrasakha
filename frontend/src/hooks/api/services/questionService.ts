import type { IQuestion } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class QuestionService {
  private _baseUrl = `${API_BASE_URL}/questions`;

  async getAllQuestions(
    pageParam: number,
    limit: number
  ): Promise<IQuestion[]> {
    try {
      const res = await fetch(
        `${this._baseUrl}?page=${pageParam}&limit=${limit}`
      );
      if (!res.ok) {
        throw new Error(`Failed to fetch questions: ${res.statusText}`);
      }
      return await res.json();
    } catch (error) {
      console.error("Error in getAllQuestions:", error);
      throw error;
    }
  }

  async getQuestionById(id: string): Promise<IQuestion> {
    try {
      const res = await fetch(`${this._baseUrl}/${id}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch question ${id}: ${res.statusText}`);
      }
      return await res.json();
    } catch (error) {
      console.error(`Error in getQuestionById(${id}):`, error);
      throw error;
    }
  }
}
