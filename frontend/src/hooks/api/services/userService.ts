import type { IUser } from "@/types";
import { apiFetch } from "../api-fetch";
import type { IUsersNameResponse } from "../user/useGetAllUserNames";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class UserService {
  private _baseUrl = `${API_BASE_URL}/users`;

  async getCurrentUser(): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/me`);
  }

  async getAllUserNames(): Promise<IUsersNameResponse | null> {
    return apiFetch<IUsersNameResponse>(`${this._baseUrl}/all`);
  }

  async edit(user: Partial<IUser>): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/`, {
      method: "PUT",
      body: JSON.stringify({ ...user }),
    });
  }
}
