import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface IChemical {
  _id?: string;
  name: string;
  status: 'Restricted' | 'Banned';
  createdBy?: string;
  updatedBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface IChemicalResponse {
  success: boolean;
  message: string;
  data: IChemical;
}

export interface IChemicalsPaginatedResponse {
  chemicals: IChemical[];
  totalCount: number;
  totalPages: number;
}

export interface ICreateChemicalRequest {
  name: string;
  status: 'Restricted' | 'Banned';
}

export interface IUpdateChemicalRequest {
  name?: string;
  status?: 'Restricted' | 'Banned';
}

export class ChemicalService {
  private _baseUrl = `${API_BASE_URL}/chemicals`;

  async getAllChemicals(params?: {
    search?: string;
    sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
    page?: number;
    limit?: number;
  }): Promise<IChemicalsPaginatedResponse> {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.sort) query.append("sort", params.sort);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());

    const response = await apiFetch<IChemicalsPaginatedResponse>(`${this._baseUrl}?${query.toString()}`);
    
    if (!response) {
      throw new Error('Failed to fetch chemicals: No response received');
    }
    
    return response;
  }

  async getChemicalById(id: string): Promise<IChemical | null> {
    const response = await apiFetch<{ success: boolean; data: IChemical }>(`${this._baseUrl}/${id}`);
    return response?.data || null;
  }

  async createChemical(data: ICreateChemicalRequest): Promise<IChemicalResponse> {
    const response = await apiFetch<IChemicalResponse>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(data),
    });
    
    if (!response) {
      throw new Error('Failed to create chemical: No response received');
    }
    
    return response;
  }

  async updateChemical(id: string, data: IUpdateChemicalRequest): Promise<IChemicalResponse> {
    const response = await apiFetch<IChemicalResponse>(`${this._baseUrl}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    
    if (!response) {
      throw new Error('Failed to update chemical: No response received');
    }
    
    return response;
  }

  async deleteChemical(id: string): Promise<{ success: boolean; message: string }> {
    const response = await apiFetch<{ success: boolean; message: string }>(`${this._baseUrl}/${id}`, {
      method: "DELETE",
    });
    
    if (!response) {
      throw new Error('Failed to delete chemical: No response received');
    }
    
    return response;
  }
}

export const chemicalService = new ChemicalService();
