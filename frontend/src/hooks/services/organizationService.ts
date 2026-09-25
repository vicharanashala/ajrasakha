import type {
  Organization,
  OrganizationBulkResponse,
  OrganizationBulkRow,
  OrganizationsResponse,
} from "@/types";
import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export class OrganizationService {
  private _baseUrl = `${API_BASE_URL}/organizations`;

  async search(
    search: string,
    page = 1,
    limit = 20,
    type?: NonNullable<Organization["type"]>,
  ): Promise<OrganizationsResponse | null> {
    const params = new URLSearchParams();
    if (search) params.append("search", search);
    params.append("page", String(page));
    params.append("limit", String(limit));
    if (type) params.append("type", type);

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

  async findBulkDuplicates(
    type: NonNullable<Organization["type"]>,
    names: string[],
  ): Promise<{ organizations: Pick<Organization, "org_name" | "state">[] } | null> {
    return apiFetch<{ organizations: Pick<Organization, "org_name" | "state">[] }>(
      `${this._baseUrl}/bulk/duplicates`,
      { method: "POST", body: JSON.stringify({ type, names }) },
    );
  }

  async bulkCreate(
    type: NonNullable<Organization["type"]>,
    rows: OrganizationBulkRow[],
  ): Promise<OrganizationBulkResponse | null> {
    return apiFetch<OrganizationBulkResponse>(`${this._baseUrl}/bulk`, {
      method: "POST",
      body: JSON.stringify({ type, rows }),
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
