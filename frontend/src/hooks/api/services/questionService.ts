import type {
  IDetailedQuestionResponse,
  IQuestion,
  QuestionFullDataResponse,
} from "@/types";
import { apiFetch } from "../api-fetch";
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

  async getAllQuestions(
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
    if (preferences.domain) params.append("domain", preferences.domain);
    if (preferences.user) params.append("user", preferences.user);

    if (preferences.answersCount) {
      const [min, max] = preferences.answersCount;
      params.append("answersCountMin", String(min));
      params.append("answersCountMax", String(max));
    }

    if (preferences.dateRange && preferences.dateRange !== "all")
      params.append("dateRange", preferences.dateRange);

    return apiFetch<IQuestion[] | null>(
      `${this._baseUrl}?${params.toString()}`
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
