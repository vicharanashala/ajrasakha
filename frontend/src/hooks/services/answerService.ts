import type {
  ISubmissions,
  SubmitAnswerResponse,
  FinalizedAnswersResponse,
  SourceItem,
} from "@/types";
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
    modifiedAnswer,
    reasonForModification,
    parameters,
    remarks,
    type
  }: IReviewAnswerPayload): Promise<SubmitAnswerResponse | null> {
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
          modifiedAnswer,
          reasonForModification,
          parameters,
          remarks,
          type
        }),
      });
    } catch (error) {
      console.error(`Error in submitAnswer(${questionId}):`, error);
      throw error;
    }
  }
  async updateAnswer(answerId: string, updatedAnswer: string,sources:SourceItem[]) {
    try {
      return await apiFetch<SubmitAnswerResponse>(
        `${this._baseUrl}/${answerId}`,
        {
          method: "PUT",
          body: JSON.stringify({ answer: updatedAnswer,sources:sources }),
        }
      );
    } catch (error) {
      console.error(`Error in updating(${answerId}):`, error);
      throw error;
    }
  }

  async getSubmissions(
    pageParam: number,
    limit: number,
    dateRange:any,
    selectedHistoryId?:string,
  ): Promise<any> {
    const params = new URLSearchParams();
  params.append("page", String(pageParam));
  params.append("limit", String(limit));

  if (dateRange?.start) params.append("start", dateRange.start);
  if (dateRange?.end) params.append("end", dateRange.end);
  if (selectedHistoryId) params.append("selectedHistoryId", selectedHistoryId);

  return apiFetch<any>(`${this._baseUrl}/submissions?${params.toString()}`);
  }
  async getFinalizedAnswers(
    userId: string,
    date: string,
    status: string
  ): Promise<FinalizedAnswersResponse | null> {
    return apiFetch<FinalizedAnswersResponse>(
      `${this._baseUrl}/finalizedAnswers?userId=${userId}&date=${date}&status=${status}`
    );
  }
}
