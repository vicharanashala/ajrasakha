import type { IUser } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type { IUsersNameResponse } from "../api/user/useGetAllUsers";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export class UserService {
  private _baseUrl = `${API_BASE_URL}/users`;

  async getCurrentUser(): Promise<IUser | null> {
    return apiFetch<IUser>(`${this._baseUrl}/me`);
  }

  async useGetAllUsers(): Promise<IUsersNameResponse | null> {
    return apiFetch<IUsersNameResponse>(`${this._baseUrl}/all`);
  }

  async edit(user: Partial<IUser>): Promise<void | null> {
    return apiFetch<void>(`${this._baseUrl}/`, {
      method: "PUT",
      body: JSON.stringify({ ...user }),
    });
  }

   async notificationDeletePreference(preference:string):Promise<void | null>{
    return apiFetch<void>(`${this._baseUrl}/`,{
      body:JSON.stringify({ preference }),
      method:"PATCH"
    })
  }

  async useGetAllExperts(page:number,limit:number,search:string):Promise<{experts:IUser[]; totalExperts:number; totalPages:number} | null>{
    return apiFetch<{experts:IUser[]; totalExperts:number; totalPages:number}>(`${this._baseUrl}/list?page=${page}&limit=${limit}&search=${search}`);
  }
}
