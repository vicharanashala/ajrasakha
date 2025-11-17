import type {  ISubmissions, SubmitAnswerResponse,FinalizedAnswersResponse, SourceItem } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type { IReviewAnswerPayload } from "../api/answer/useReviewAnswer";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class AnswerService {
  private _baseUrl = `${API_BASE_URL}/answers`;

  async submitAnswer(
    questionId: string,
    answer: string,
    sources: SourceItem[]
  ): Promise<SubmitAnswerResponse | null> {
    try {
      return await apiFetch<SubmitAnswerResponse>(this._baseUrl, {
        method: "POST",
        body: JSON.stringify({ answer, questionId, sources }),
      });
    } catch (error) {
      console.error(`Error in submitAnswer(${questionId}):`, error);
      throw error;
    }
  }
  async reviewAnswer({
    questionId,
    status,
    answer,
    sources,
    reasonForRejection,
    approvedAnswer,
    rejectedAnswer,
  }:IReviewAnswerPayload): Promise<SubmitAnswerResponse | null> {
    try {
      return await apiFetch<SubmitAnswerResponse>(`${this._baseUrl}/review`, {
        method: "POST",
        body: JSON.stringify({
          questionId,
          status,
          answer,
          sources,
          reasonForRejection,
          approvedAnswer,
          rejectedAnswer,
        }),
      });
    } catch (error) {
      console.error(`Error in submitAnswer(${questionId}):`, error);
      throw error;
    }
  }
  async updateAnswer(answerId: string, updatedAnswer: string) {
    try {
      return await apiFetch<SubmitAnswerResponse>(
        `${this._baseUrl}/${answerId}`,
        {
          method: "PUT",
          body: JSON.stringify({ answer: updatedAnswer }),
        }
      );
    } catch (error) {
      console.error(`Error in updating(${answerId}):`, error);
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
  async getFinalizedAnswers(userId:string,date:string,status:string): Promise<FinalizedAnswersResponse | null> {
    return apiFetch<FinalizedAnswersResponse>(`${this._baseUrl}/finalizedAnswers?userId=${userId}&date=${date}&status=${status}`);
  }

}
