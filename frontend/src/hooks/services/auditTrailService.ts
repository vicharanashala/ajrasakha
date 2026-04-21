import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();
export class AuditTrailService {
  private _baseUrl = `${API_BASE_URL}/audit-trails`;

  async getAllAuditTrails(
    pageParam: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    category?: string | null,
    action?: string | null,
    order?: "asc" | "desc",
    outComeStatus?: string,
  ): Promise<any> {
    const params = new URLSearchParams();
    params.append("page", String(pageParam));
    params.append("limit", String(limit));
    if (startDate) params.append("start", startDate);
    if (endDate) params.append("end", endDate);
    if (category) params.append("category", category);
    if (action) params.append("action", action);
    if (order) params.append("order", order);
    if (outComeStatus) params.append("status", outComeStatus);
    return apiFetch<any>(`${this._baseUrl}?${params.toString()}`);
  }
}
