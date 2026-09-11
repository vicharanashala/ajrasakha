import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type { PopMatchStatus } from "./newSourceService";

const API_BASE_URL = env.apiBaseUrl();

export interface PopLookupResult {
  found: boolean;
  _id?: string;
  shareable_name?: string;
  shareable_link?: string;
  year_of_release?: string | number;
  matchStatus?: PopMatchStatus;
}

export class PopService {
  private _baseUrl = `${API_BASE_URL}/source-reference`;

  async lookup(source: string): Promise<PopLookupResult | null> {
    const params = new URLSearchParams({ source });

    return apiFetch<PopLookupResult>(`${this._baseUrl}?${params.toString()}`);
  }
}
