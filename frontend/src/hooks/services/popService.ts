import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface PopLookupResult {
  found: boolean;
  shareable_name?: string;
  shareable_link?: string;
}

export class PopService {
  private _baseUrl = `${API_BASE_URL}/source-reference`;

  async lookup(source: string): Promise<PopLookupResult | null> {
    const params = new URLSearchParams({ source });

    return apiFetch<PopLookupResult>(`${this._baseUrl}?${params.toString()}`);
  }
}
