import type { IComment } from "@/types";
import { apiFetch } from "../api/api-fetch";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class CommentService {
  private _baseUrl = `${API_BASE_URL}/comments`;

  async getComments(
    pageParam: number,
    limit: number,
    questionId?: string,
    answerId?: string
  ): Promise<IComment[] | null> {
    return apiFetch<IComment[] | null>(
      `${this._baseUrl}/question/${questionId}/answer/${answerId}?page=${pageParam}&limit=${limit}`
    );
  }

  async addComment(
    questionId: string,
    answerId: string,
    text: string
  ): Promise<void> {
    try {
      return (await apiFetch<void>(
        `${this._baseUrl}/question/${questionId}/answer/${answerId}`,
        {
          method: "POST",
          body: JSON.stringify({ text }),
        }
      )) as void;
    } catch (error) {
      console.error(`Error in submitAnswer(${questionId}):`, error);
      throw error;
    }
  }
}
