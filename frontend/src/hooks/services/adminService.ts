import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type { IUser } from "@/types";

const API_BASE_URL = env.apiBaseUrl();

export class AdminUserService {
  private _baseUrl = `${API_BASE_URL}/users`;

  async removeExpertAllocations(
    expertId: string,
  ): Promise<{
    message: string;
    questionsAffected: number;
    removedQueues: number;
    workloadBefore: number;
    workloadAfter: number;
    questionIds: string[];
  } | null> {
    return apiFetch<{
      message: string;
      questionsAffected: number;
      removedQueues: number;
      workloadBefore: number;
      workloadAfter: number;
      questionIds: string[];
    }>(`${this._baseUrl}/${expertId}/remove-allocations`, {
      method: "POST",
    });
  }

  async getAllUsers(
    page: number,
    limit: number,
    search: string,
    sort: string,
    filter: string,
    role: string,
    isBlocked: string,
    isVerified: string,
    isSTF: string
  ): Promise<{ users: IUser[]; totalUsers: number; totalPages: number } | null> {
    return apiFetch(
      `${this._baseUrl}/admin/all?page=${page}&limit=${limit}&search=${search}&sort=${sort}&filter=${filter}&role=${role}&isBlocked=${isBlocked}&isVerified=${isVerified}&isSTF=${isSTF}`
    );
  }
}
