import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface ICropResponse {
  _id?: string;
  name: string;
  aliases: string[];
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICreateCropPayload {
  name: string;
  aliases?: string[];
}

export interface ICreateCropResponse {
  success: boolean;
  message: string;
  data: ICropResponse;
}

export interface IGetAllCropsResponse {
  crops: ICropResponse[];
  totalCount: number;
  totalPages: number;
}

export class CropService {
  private _baseUrl = `${API_BASE_URL}/crops`;

  async createCrop(payload: ICreateCropPayload): Promise<ICreateCropResponse | null> {
    return apiFetch<ICreateCropResponse>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  async getAllCrops(query?: {
    search?: string;
    sort?: string;
    page?: number;
    limit?: number;
  }): Promise<IGetAllCropsResponse | null> {
    const params = new URLSearchParams();
    if (query?.search) params.append("search", query.search);
    if (query?.sort) params.append("sort", query.sort);
    if (query?.page) params.append("page", query.page.toString());
    if (query?.limit) params.append("limit", query.limit.toString());

    return apiFetch<IGetAllCropsResponse>(`${this._baseUrl}?${params.toString()}`);
  }
}
