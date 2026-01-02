import type { IUser,ReviewLevelCount } from "@/types";
import { apiFetch } from "../api/api-fetch";
import type { IUsersNameResponse } from "../api/user/useGetAllUsers";
import { formatDateLocal } from "@/utils/formatDate";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

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

  async useGetAllExperts(page:number,limit:number,search:string,sort:string,filter:string):Promise<{experts:IUser[]; totalExperts:number; totalPages:number} | null>{
    return apiFetch<{experts:IUser[]; totalExperts:number; totalPages:number}>(`${this._baseUrl}/list?page=${page}&limit=${limit}&search=${search}&sort=${sort}&filter=${filter}`);
  }

  async isBlockUser(userId:string,action:string):Promise<void | null>{
    return apiFetch<void>(`${this._baseUrl}/expert`,{
      body:JSON.stringify({ userId,action }),
      method:"PATCH"
    })
  }

   async Getuser(email:string):Promise<IUser| null>{
    return apiFetch<IUser | null>(`${this._baseUrl}/details/${email}`);
  }
  async getUserReviewLevel(userId?:string|undefined,startTime?:Date|undefined,endTime?:Date|undefined,role?:string,state?:string,crop?:string,domain?:string,status?:string): Promise<ReviewLevelCount[] | null> {
    const params = new URLSearchParams();

    if (startTime) {
      params.append("startTime", formatDateLocal(startTime));
    }

    if (endTime) {
      params.append("endTime", formatDateLocal(endTime));
    }
    if(userId)
    {
      params.append("userId", userId)
    }
   
    if(role)
    {
      params.append("role",role)
    }
    if(state)
    {
      params.append("state",state)
    }
    if(crop)
    {
      params.append("crop",crop)
    }
    if(domain)
    {
      params.append("domain",domain)
    }
    if(status)
    {
      params.append("status",status)
    }
    return apiFetch<ReviewLevelCount[]>(`${this._baseUrl}/review-level?${params.toString()}`);
  }
}
