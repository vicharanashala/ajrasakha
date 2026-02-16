import type {
  IDetailedQuestion,
  IDetailedQuestionResponse,
  IQuestion,
  QuestionFullDataResponse,
  RejectReRoutePayload,
  IRerouteHistoryResponse,
  ReroutedQuestionItem,
  WorkloadBalanceResponse
} from "@/types";
import { apiFetch } from "../api/api-fetch";
import type { QuestionFilter } from "@/features/qa-interface-page/QA-interface";
import type { GeneratedQuestion } from "@/components/voice-recorder-card";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";
import { formatDateLocal } from "@/utils/formatDate";
import { env } from "@/config/env";
import type { ReviewLevelsApiResponse } from "@/features/questions/types";
import { auth } from "@/config/firebase";
import { getIdToken } from "firebase/auth";

const API_BASE_URL = env.apiBaseUrl();
export class QuestionService {
  private _baseUrl = `${API_BASE_URL}/questions`;
  private _reRouteUrl = `${API_BASE_URL}/reroute`;

  async useGetAllDetailedQuestions(
    pageParam: number,
    limit: number,
    filter: AdvanceFilterValues,
    search: string,
    sort?: string
  ): Promise<IDetailedQuestionResponse | null> {
    const params = new URLSearchParams();

    if (search) params.append("search", search);
    if (sort) params.append("sort", sort);
    params.append("page", pageParam.toString());
    params.append("limit", limit.toString());

    if (filter.status) params.append("status", filter.status);
    if (filter.source) params.append("source", filter.source);
    if (filter.state) params.append("state", filter.state);
    if (filter.crop) params.append("crop", filter.crop);
    if (filter.priority) params.append("priority", filter.priority);
    if (filter.domain) params.append("domain", filter.domain);
    if (filter.user) params.append("user", filter.user);
    if (filter.review_level) params.append("review_level", filter.review_level);
    if (filter.startTime) {
      params.append("startTime", formatDateLocal(filter.startTime));
    }
    if (filter.endTime) {
      params.append("endTime", formatDateLocal(filter.endTime));
    }
    if (filter.closedAtEnd) {
      params.append("closedAtEnd", formatDateLocal(filter.closedAtEnd));
    }
    if (filter.closedAtStart) {
      params.append("closedAtStart", formatDateLocal(filter.closedAtStart));
    }
    if (filter.consecutiveApprovals) {
      params.append("consecutiveApprovals", filter.consecutiveApprovals);
    }
    if (filter.autoAllocateFilter) {
      params.append("autoAllocateFilter", filter.autoAllocateFilter);
    }

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
    preferences: AdvanceFilterValues,
    actionType:string,
    autoSelectQuestionId?:string|null,
    reviewLevel?:string
  ): Promise<IQuestion[] | ReroutedQuestionItem[] |null> {
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
    if(autoSelectQuestionId)
    {
      params.append("autoSelectQuestionId", autoSelectQuestionId);

    }
    if(reviewLevel)
    {
      params.append("review_level",reviewLevel);

    }

    if (preferences.dateRange && preferences.dateRange !== "all")
      params.append("dateRange", preferences.dateRange);
      if(actionType=="allocated")
      {
        return apiFetch<IQuestion[] | null>(
          `${this._baseUrl}/allocated?${params.toString()}`
        );
      }
      else{
        return apiFetch<ReroutedQuestionItem[]| null>(
          `${this._reRouteUrl}/allocated?${params.toString()}`
        );
      }

   
  }

  async getQuestionById(id: string,actionType:string): Promise<IQuestion | null> {
    if(actionType=="allocated")
      {
        return apiFetch<IQuestion | null>(`${this._baseUrl}/${id}`);
      }
      else{
        return apiFetch<IQuestion | null>(`${this._reRouteUrl}/${id}`);
      }

    
  }
  async rejectRerouteRequest(payload: RejectReRoutePayload) {
  const { rerouteId, questionId, ...body } = payload;

  return apiFetch<void>(`${this._reRouteUrl}/${rerouteId}/${questionId}`,{
    body:JSON.stringify(body),
    method:"PATCH"
  })
 
}

  async getQuestionFullDataById(
    id: string
  ): Promise<QuestionFullDataResponse | null> {
    return apiFetch<QuestionFullDataResponse | null>(
      `${this._baseUrl}/${id}/full`
    );
  }
  async getReRoutedQuestionFullDataById(
    answerId: string
  ): Promise< IRerouteHistoryResponse[]| null> {
    return apiFetch<IRerouteHistoryResponse[] | null>(
      `${this._reRouteUrl}/${answerId}/history`
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
    newQuestionData: Partial<IDetailedQuestion> | FormData,
    isFormData = false
  ): Promise<void | null> {
    const body: BodyInit | null = isFormData
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
  async allocateReRouteExperts(
    questionId: string,
    expertId: string,
    moderatorId?:string,
    answerId?:string,
    comment?:string,
    status?:string

  ): Promise<IDetailedQuestion | null> {
    return apiFetch<IDetailedQuestion>(
      `${this._reRouteUrl}/${questionId}/allocate-reroute-experts`,
      {
        method: "POST",
        body: JSON.stringify({ expertId,
          moderatorId,
          answerId,
          comment,
        status }),
      }
    );
  }

  async getAllocatedQuestionPage(questionId: string) {
    return apiFetch<number>(
      `${this._baseUrl}/allocated/page?questionId=${questionId}`
    );
  }

  async bulkDeleteQuestions(questionIds: string[]) {
    return apiFetch<{ deletedCount: number }>(`${this._baseUrl}/bulk`, {
      method: "DELETE",
      body: JSON.stringify({ questionIds }),
    });
  }

  
  async GetQuestionsAndLevels(
  pageParam: number,
  limit: number,
  search: string,
  filter:AdvanceFilterValues,
  sort: string
):Promise<ReviewLevelsApiResponse | null> {
  const params = new URLSearchParams();
    if(sort) params.append('sort',sort)
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
    if (filter.review_level) params.append("review_level", filter.review_level);
    if (filter.startTime) {
      params.append("startTime", formatDateLocal(filter.startTime));
    }
    if (filter.endTime) {
      params.append("endTime", formatDateLocal(filter.endTime));
    }
    if (filter.closedAtEnd) {
      params.append("closedAtEnd", formatDateLocal(filter.closedAtEnd));
    }
    if (filter.closedAtStart) {
      params.append("closedAtStart", formatDateLocal(filter.closedAtStart));
    }

    if (filter.answersCount) {
      params.append("answersCountMin", filter.answersCount[0].toString());
      params.append("answersCountMax", filter.answersCount[1].toString());
    }
    if (filter.consecutiveApprovals) {
      params.append("consecutiveApprovals", filter.consecutiveApprovals);
    }
    if (filter.autoAllocateFilter) {
      params.append("autoAllocateFilter", filter.autoAllocateFilter);
    }

    if (filter.dateRange && filter.dateRange !== "all")
      params.append("dateRange", filter.dateRange);
    return apiFetch(
    `${this._baseUrl}?${params.toString()}`
   );
}
async reAllocateLessWorkload(): Promise<WorkloadBalanceResponse|null> {
  return apiFetch<WorkloadBalanceResponse|null>(`${this._baseUrl}/reAllocateLessWorkload`,{method: "POST",});
}

async downloadQuestionReport(consecutiveApprovals?: string, startDate?: string, endDate?: string): Promise<Blob> {
  const params = new URLSearchParams();
  if (consecutiveApprovals && consecutiveApprovals !== "all") {
    params.append("consecutiveApprovals", consecutiveApprovals);
  }
  if (startDate) {
    params.append("startDate", startDate);
  }
  if (endDate) {
    params.append("endDate", endDate);
  }
  
  // Get the current Firebase user and token
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new Error("User not authenticated");
  }
  
  const token = await getIdToken(firebaseUser);
  
  const response = await fetch(
    `${this._baseUrl}/download-question-report?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`, 
      },
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to download report");
  }
  
  return await response.blob();
}


async sendOutreachReport(
  startDate: Date,
  endDate: Date,
  emails: string[]
): Promise<{ success: boolean; message: string } | null> {
  return apiFetch<{ success: boolean; message: string } | null>(
    `${this._baseUrl}/data/out-reach/date`,
    {
      method: "POST",
      body: JSON.stringify({
        startDate: formatDateLocal(startDate),
        endDate: formatDateLocal(endDate),
        emails,
      }),
    }
  );
}

async downloadOverallReport(startDate?: string, endDate?: string): Promise<Blob> {
  const params = new URLSearchParams();
  if (startDate) {
    params.append("startDate", startDate);
  }
  if (endDate) {
    params.append("endDate", endDate);
  }
  
  // Get the current Firebase user and token
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new Error("User not authenticated");
  }
  
  const token = await getIdToken(firebaseUser);
  
  const response = await fetch(
    `${this._baseUrl}/download-overall-report?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`, 
      },
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to download overall report");
  }
  
  return await response.blob();
}

async downloadFilteredReport(filters: {
  state?: string;
  crop?: string;
  season?: string;
  domain?: string;
  status?: string;
}): Promise<Blob> {
  const params = new URLSearchParams();
  if (filters.state && filters.state !== 'all') {
    params.append("state", filters.state);
  }
  if (filters.crop && filters.crop !== 'all') {
    params.append("crop", filters.crop);
  }
  if (filters.season && filters.season !== 'all') {
    params.append("season", filters.season);
  }
  if (filters.domain && filters.domain !== 'all') {
    params.append("domain", filters.domain);
  }
  if (filters.status && filters.status !== 'all') {
    params.append("status", filters.status);
  }
  
  // Get the current Firebase user and token
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    throw new Error("User not authenticated");
  }
  
  const token = await getIdToken(firebaseUser);
  
  const response = await fetch(
    `${this._baseUrl}/download-filtered-report?${params.toString()}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`, 
      },
    }
  );
  
  if (!response.ok) {
    throw new Error("Failed to download filtered report");
  }
  
  return await response.blob();
}

}
