import type {
  ISubmissions,
  SubmitAnswerResponse,
  FinalizedAnswersResponse,
  SourceItem,
  UploadedDocumentInfo,
} from "@/types";
import { apiFetch, getCurrentUser } from "../api/api-fetch";
import { getIdToken } from "firebase/auth";
import type { IReviewAnswerPayload } from "../api/answer/useReviewAnswer";
import { env } from "@/config/env";
export interface IFetchAnswerPayload {
  query: string;
  crop: string;
  state: string;
}
const API_BASE_URL = env.apiBaseUrl();

export class AnswerService {
  private _baseUrl = `${API_BASE_URL}/answers`;

  async submitAnswer(
    questionId: string,
    answer: string,
    sources: SourceItem[],
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

  async uploadDocument(
    file: File,
  ): Promise<{ document: UploadedDocumentInfo } | null> {
    const formData = new FormData();
    formData.append("file", file);
    return apiFetch<{ document: UploadedDocumentInfo }>(
      `${this._baseUrl}/documents/upload`,
      {
        method: "POST",
        body: formData,
      },
    );
  }

  /** Downloads an uploaded document as a Blob (auth token attached). */
  async downloadDocument(id: string): Promise<Blob | null> {
    const firebaseUser = await getCurrentUser();
    let token: string | null = null;
    if (firebaseUser) {
      try {
        token = await getIdToken(firebaseUser);
      } catch (err) {
        console.error("Failed to get token:", err);
      }
    }
    const res = await fetch(`${this._baseUrl}/documents/${id}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      throw new Error(`Document download failed with status ${res.status}`);
    }
    return res.blob();
  }
  async confirmDuplicate(
    questionId: string,
  ): Promise<{ status: string; closed: boolean } | null> {
    return apiFetch(`${this._baseUrl}/${questionId}/confirm-duplicate`, {
      method: "POST",
    });
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
    type,
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
          type,
        }),
      });
    } catch (error) {
      console.error(`Error in submitAnswer(${questionId}):`, error);
      throw error;
    }
  }
  /* async updateAnswer(answerId: string, updatedAnswer: string,sources:SourceItem[]) {
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
  }*/
  async updateAnswer(
    answerId?: string,
    updatedAnswer?: string,
    sources?: SourceItem[],
    source?: string,
    questionId?: string,
    closeIntent?: "gdb" | "notify",
  ) {
    try {
      return await apiFetch<SubmitAnswerResponse>(`${this._baseUrl}`, {
        method: "PUT",
        body: JSON.stringify({
          ...(answerId && { answerId }),
          ...(updatedAnswer && { answer: updatedAnswer }),
          ...(sources && { sources }),
          ...(source && { source }),
          ...(questionId && { questionId }),
          ...(closeIntent && { closeIntent }),
        }),
      });
    } catch (error) {
      console.error(`Error in updating(${answerId}):`, error);
      throw error;
    }
  }

  async approveLLMAnswer(
    questionId: string,
    updatedAnswer: string,
    sources: SourceItem[],
    source: string,
  ) {
    try {
      return await apiFetch<SubmitAnswerResponse>(
        `${this._baseUrl}/moderator/approve`,
        {
          method: "POST",
          body: JSON.stringify({
            questionId,
            answer: updatedAnswer,
            sources,
            source,
          }),
        },
      );
    } catch (error) {
      console.error(`Error in approveLLMAnswer(${questionId}):`, error);
      throw error;
    }
  }

  async getSubmissions(
    pageParam: number,
    limit: number,
    dateRange: any,
    selectedHistoryId?: string,
    expertId?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("page", String(pageParam));
    params.append("limit", String(limit));

    if (dateRange?.start) params.append("start", dateRange.start);
    if (dateRange?.end) params.append("end", dateRange.end);
    if (selectedHistoryId)
      params.append("selectedHistoryId", selectedHistoryId);
    if (expertId) params.append("expertId", expertId);

    return apiFetch<any>(`${this._baseUrl}/submissions?${params.toString()}`);
  }
  async getFinalizedAnswers(
    userId: string,
    date: string,
    status: string,
  ): Promise<FinalizedAnswersResponse | null> {
    return apiFetch<FinalizedAnswersResponse>(
      `${this._baseUrl}/finalizedAnswers?userId=${userId}&date=${date}&status=${status}`,
    );
  }

  async fetchAiInitialAnswer(
    payload: IFetchAnswerPayload,
  ): Promise<any | null> {
    try {
      return apiFetch<any>(`${this._baseUrl}/fetch-ai-answer`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      console.error(`Error in fetchAiInitialAnswer:`, error);
      throw error;
    }
  }
}
