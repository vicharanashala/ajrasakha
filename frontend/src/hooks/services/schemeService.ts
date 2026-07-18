import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface IScheme {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  benefits: string;
  category: string;
  states: string[];
  applicationProcess: string;
  deadline: string;
  websiteUrl: string;
  contactInfo: string;
}

export interface ISchemesPaginatedResponse {
  schemes: IScheme[];
  totalCount: number;
  totalPages: number;
}

export class SchemeService {
  private _baseUrl = `${API_BASE_URL}/schemes`;

  async getAll(params?: {
    category?: string;
    state?: string;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<ISchemesPaginatedResponse> {
    const query = new URLSearchParams();
    if (params?.category) query.append("category", params.category);
    if (params?.state) query.append("state", params.state);
    if (params?.search) query.append("search", params.search);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());

    const response = await apiFetch<ISchemesPaginatedResponse>(
      `${this._baseUrl}?${query.toString()}`
    );

    if (!response) {
      throw new Error("Failed to fetch schemes: No response received");
    }

    return response;
  }

  async getCategories(): Promise<string[]> {
    const response = await apiFetch<string[]>(`${this._baseUrl}/categories`);
    return response || [];
  }

  async getStates(): Promise<string[]> {
    const response = await apiFetch<string[]>(`${this._baseUrl}/states`);
    return response || [];
  }

  async getById(id: string): Promise<IScheme | null> {
    const response = await apiFetch<{ success: boolean; data: IScheme }>(
      `${this._baseUrl}/${id}`
    );
    return response?.data || null;
  }
}

export const schemeService = new SchemeService();
