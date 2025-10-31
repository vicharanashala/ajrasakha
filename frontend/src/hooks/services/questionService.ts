import type {
  IDetailedQuestion,
  IDetailedQuestionResponse,
  IQuestion,
  QuestionFullDataResponse,
} from "@/types";
import { apiFetch } from "../api/api-fetch";
import type { QuestionFilter } from "@/components/QA-interface";
import type { GeneratedQuestion } from "@/components/voice-recorder-card";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class QuestionService {
  private _baseUrl = `${API_BASE_URL}/questions`;

  async useGetAllDetailedQuestions(
    pageParam: number,
    limit: number,
    filter: AdvanceFilterValues,
    search: string
  ): Promise<IDetailedQuestionResponse | null> {
    const params = new URLSearchParams();

    if (search) params.append("search", search);
    params.append("page", pageParam.toString());
    params.append("limit", limit.toString());

    if (filter.status) params.append("status", filter.status);
    if (filter.source) params.append("source", filter.source);
    if (filter.state) params.append("state", filter.state);
    if (filter.crop) params.append("crop", filter.crop);
    if (filter.priority) params.append("priority", filter.priority);
    if (filter.domain) params.append("domain", filter.domain);
    if (filter.user) params.append("user", filter.user);

    if (filter.answersCount) {
      params.append("answersCountMin", filter.answersCount[0].toString());
      params.append("answersCountMax", filter.answersCount[1].toString());
    }

    if (filter.dateRange && filter.dateRange !== "all")
      params.append("dateRange", filter.dateRange);

    return apiFetch<IDetailedQuestionResponse | null>(
      `${this._baseUrl}/detailed?${params.toString()}`
    );
  }

  async useGetAllocatedQuestions(
    pageParam: number,
    limit: number,
    filter: QuestionFilter,
    preferences: AdvanceFilterValues
  ): Promise<IQuestion[] | null> {
    const params = new URLSearchParams({
      page: pageParam.toString(),
      limit: limit.toString(),
      filter: filter.toString(),
    });

    if (preferences.status && preferences.status !== "all")
      params.append("status", preferences.status);
    if (preferences.source && preferences.source !== "all")
      params.append("source", preferences.source);
    if (preferences.state && preferences.state !== "all")
      params.append("state", preferences.state);
    if (preferences.crop && preferences.crop !== "all")
      params.append("crop", preferences.crop);
    if (preferences.priority && preferences.priority !== "all")
      params.append("priority", preferences.priority);
    if (preferences.domain && preferences.domain !== "all")
      params.append("domain", preferences.domain);
    if (preferences.user && preferences.user !== "all")
      params.append("user", preferences.user);

    if (preferences.answersCount) {
      const [min, max] = preferences.answersCount;
      params.append("answersCountMin", String(min));
      params.append("answersCountMax", String(max));
    }

    if (preferences.dateRange && preferences.dateRange !== "all")
      params.append("dateRange", preferences.dateRange);

    return apiFetch<IQuestion[] | null>(
      `${this._baseUrl}/allocated?${params.toString()}`
    );
  }

  async getQuestionById(id: string): Promise<IQuestion | null> {
    return apiFetch<IQuestion | null>(`${this._baseUrl}/${id}`);
  }

  async getQuestionFullDataById(
    id: string
  ): Promise<QuestionFullDataResponse | null> {
    return apiFetch<QuestionFullDataResponse | null>(
      `${this._baseUrl}/${id}/full`
    );
  }

  async generateQuestions(
    transcript: string
  ): Promise<GeneratedQuestion[] | null> {
    return apiFetch<GeneratedQuestion[] | null>(`${this._baseUrl}/generate`, {
      method: "POST",
      body: JSON.stringify({ transcript }),
    });
  }

  async addQuestion(
    newQuestionData: Partial<IDetailedQuestion> | FormData,isFormData=false
  ): Promise<void | null> {
    const body: BodyInit | null =
    isFormData
      ? (newQuestionData as FormData)
      : JSON.stringify(newQuestionData);
    return apiFetch<void>(`${this._baseUrl}`, {
      // method: "POST",
      // // body: JSON.stringify(newQuestionData),
      // body:isFormData ? newQuestionData : JSON.stringify(newQuestionData),
      // headers: isFormData
      // ? undefined // Let browser set correct multipart/form-data boundary
      // : { "Content-Type": "application/json" }, 
      method: "POST",
    body,
    headers: isFormData
      ? undefined // Let browser set multipart boundary automatically
      : { "Content-Type": "application/json" },
    });
  }

  async updateQuestion(
    questionId: string,
    updatedData: Partial<IDetailedQuestion>
  ): Promise<IDetailedQuestion | null> {
    return apiFetch<IDetailedQuestion>(`${this._baseUrl}/${questionId}`, {
      method: "PUT",
      body: JSON.stringify(updatedData),
    });
  }

  async removeAllocation(
    questionId: string,
    index: number
  ): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/${questionId}/allocation`, {
      method: "DELETE",
      body: JSON.stringify({ index }),
    });
  }

  async deleteQuestion(questionId: string): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/${questionId}`, {
      method: "DELETE",
    });
  }

  async toggleAutoAllocate(
    questionId: string
  ): Promise<IDetailedQuestion | null> {
    return apiFetch<IDetailedQuestion>(
      `${this._baseUrl}/${questionId}/toggle-auto-allocate`,
      {
        method: "PATCH",
      }
    );
  }

  async allocateExperts(
    questionId: string,
    experts: string[]
  ): Promise<IDetailedQuestion | null> {
    return apiFetch<IDetailedQuestion>(
      `${this._baseUrl}/${questionId}/allocate-experts`,
      {
        method: "POST",
        body: JSON.stringify({ experts }),
      }
    );
  }
}
