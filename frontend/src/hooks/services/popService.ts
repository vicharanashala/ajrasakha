import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type { PopMatchStatus } from "./newSourceService";

const API_BASE_URL = env.apiBaseUrl();

export type PopRequiredField = "year_of_release" | "live_source_link" | "shareable_name";

export interface PopLookupResult {
  found: boolean;
  _id?: string;
  shareable_name?: string;
  shareable_link?: string;
  year_of_release?: string | number | null;
  live_source_link?: string | null;
  // Which of year_of_release/live_source_link/shareable_name are missing on the matched
  // document - non-empty only when found is true.
  missingFields?: PopRequiredField[];
  matchStatus?: PopMatchStatus;
}

export class PopService {
  private _baseUrl = `${API_BASE_URL}/source-reference`;

  async lookup(source: string): Promise<PopLookupResult | null> {
    const params = new URLSearchParams({ source });

    return apiFetch<PopLookupResult>(`${this._baseUrl}?${params.toString()}`);
  }

  /** Fills in the given (previously-missing) fields on a matched pop_unique_documents
   *  document and returns the refreshed lookup result. */
  async updateMissingFields(
    id: string,
    fields: Partial<Record<PopRequiredField, string | number>>,
  ): Promise<PopLookupResult | null> {
    return apiFetch<PopLookupResult>(`${this._baseUrl}/${id}`, {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
  }
}
