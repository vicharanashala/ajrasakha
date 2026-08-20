import { apiFetch, getCurrentUser } from "../api/api-fetch";
import { getIdToken } from "firebase/auth";
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

  /** Download all users matching the given filters as an .xlsx blob. */
  async exportUsers(params: {
    search?: string;
    sort?: string;
    filter?: string;
    role?: string;
    isBlocked?: string;
    isVerified?: string;
    isSTF?: string;
  }): Promise<Blob> {
    const qs = new URLSearchParams();
    if (params.search) qs.append("search", params.search);
    if (params.sort) qs.append("sort", params.sort);
    if (params.filter && params.filter !== "ALL") qs.append("filter", params.filter);
    if (params.role && params.role !== "ALL") qs.append("role", params.role);
    if (params.isBlocked && params.isBlocked !== "ALL") qs.append("isBlocked", params.isBlocked);
    if (params.isVerified && params.isVerified !== "ALL") qs.append("isVerified", params.isVerified);
    if (params.isSTF && params.isSTF !== "ALL") qs.append("isSTF", params.isSTF);

    const user = await getCurrentUser();
    if (!user) throw new Error("User not authenticated");
    const token = await getIdToken(user);

    const res = await fetch(`${this._baseUrl}/admin/all/export?${qs.toString()}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to export users");
    return await res.blob();
  }
}
