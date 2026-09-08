import type { OrganizationsResponse } from "@/types";
import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export class OrganizationService {
  private _baseUrl = `${API_BASE_URL}/organizations`;

  async search(
    search: string,
    page = 1,
    limit = 20,
  ): Promise<OrganizationsResponse | null> {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));

    return apiFetch<OrganizationsResponse>(
      `${this._baseUrl}?${params.toString()}`,
    );
  }

  async create(data: any): Promise<any> {
    return apiFetch<any>(this._baseUrl, {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async update(id: string, data: any): Promise<any> {
    return apiFetch<any>(`${this._baseUrl}/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async delete(id: string): Promise<any> {
    return apiFetch<any>(`${this._baseUrl}/${id}`, {
      method: "DELETE",
    });
  }
}
