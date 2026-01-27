import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type { IUser } from "@/types";

const API_BASE_URL = env.apiBaseUrl();

export class AdminUserService {
  private _baseUrl = `${API_BASE_URL}/users`;

  async getAllUsers(
    page: number,
    limit: number,
    search: string,
    sort: string,
    filter: string
  ): Promise<{ users: IUser[]; totalUsers: number; totalPages: number } | null> {
    return apiFetch(
      `${this._baseUrl}/admin/all?page=${page}&limit=${limit}&search=${search}&sort=${sort}&filter=${filter}`
    );
  }
}
