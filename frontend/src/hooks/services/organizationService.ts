import type { OrganizationsResponse } from "@/types";
import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export class OrganizationService {
  private _baseUrl = `${API_BASE_URL}/organizations`;

  async search(
    search: string,
    limit = 20,
  ): Promise<OrganizationsResponse | null> {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    params.append("limit", String(limit));

    return apiFetch<OrganizationsResponse>(
      `${this._baseUrl}?${params.toString()}`,
    );
  }
}
