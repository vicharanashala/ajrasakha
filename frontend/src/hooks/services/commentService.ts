import type { IComment } from "@/types";
import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export class CommentService {
  private _baseUrl = `${API_BASE_URL}/comments`;

  async getComments(
    pageParam: number,
    limit: number,
    questionId?: string,
    answerId?: string
  ): Promise<{comments: IComment[]; total: number} | null> {
    // alert(`${this._baseUrl}/question/${questionId}/answer/${answerId}?page=${pageParam}&limit=${limit}`)
    return apiFetch<{comments: IComment[]; total: number} | null>(
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
