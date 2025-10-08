import type { IQuestion, QuestionFullDataResponse } from "@/types";
import { apiFetch } from "../api-fetch";
import type { QuestionFilter } from "@/components/QA-interface";
import type { GeneratedQuestion } from "@/components/voice-recorder-card";
import type {
  AdvanceFilterValues,
  IDetailedQuestion,
} from "@/components/questions-page";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class QuestionService {
  private _baseUrl = `${API_BASE_URL}/questions`;

  async useGetAllDetailedQuestions(
    pageParam: number,
    limit: number,
    filter: AdvanceFilterValues,
    search: string
  ): Promise<IDetailedQuestion[] | null> {
    const params = new URLSearchParams();

    if (search) params.append("search", search);
    params.append("page", pageParam.toString());
    params.append("limit", limit.toString());

    if (filter.status) params.append("status", filter.status);
    if (filter.source) params.append("source", filter.source);
    if (filter.state) params.append("state", filter.state);
    if (filter.crop) params.append("crop", filter.crop);

    if (filter.answersCount) {
      params.append("answersCountMin", filter.answersCount[0].toString());
      params.append("answersCountMax", filter.answersCount[1].toString());
    }

    if (filter.dateRange && filter.dateRange !== "all")
      params.append("dateRange", filter.dateRange);

    return apiFetch<IDetailedQuestion[] | null>(
      `${this._baseUrl}/detailed?${params.toString()}`
    );
  }

  async getAllQuestions(
    pageParam: number,
    limit: number,
    filter: QuestionFilter
  ): Promise<IQuestion[] | null> {
    return apiFetch<IQuestion[] | null>(
      `${this._baseUrl}?filter=${filter}&page=${pageParam}&limit=${limit}`
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
}
