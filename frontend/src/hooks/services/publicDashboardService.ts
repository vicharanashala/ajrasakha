import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

/** Well-known item names (must match the backend). */
export const SATURATION_LIMIT_NAME = "saturation limit crop";
export const OUTREACH_VIDEO_NAME = "outreach video";

/**
 * A single public dashboard item. Every admin-editable value (saturation limit, outreach
 * video URLs, future images/tunables) is stored in one `items` array with this shape.
 */
export interface PublicDashboardItem {
  id: string;
  name: string;
  value: unknown;
  createdAt?: string;
}

export class PublicDashboardService {
  /** Public read of all items. */
  async getItems(): Promise<PublicDashboardItem[] | null> {
    return apiFetch<PublicDashboardItem[]>(
      `${API_BASE_URL}/public-dashboard/items`,
    );
  }

  /** Admin-only: add an item. */
  async addItem(
    name: string,
    value: unknown,
  ): Promise<PublicDashboardItem | null> {
    return apiFetch<PublicDashboardItem>(
      `${API_BASE_URL}/public-dashboard/items`,
      { method: "POST", body: JSON.stringify({ name, value }) },
    );
  }

  /** Admin-only: update an item's name/value by id. */
  async updateItem(
    id: string,
    patch: { name?: string; value?: unknown },
  ): Promise<PublicDashboardItem | null> {
    return apiFetch<PublicDashboardItem>(
      `${API_BASE_URL}/public-dashboard/items/${id}`,
      { method: "PUT", body: JSON.stringify(patch) },
    );
  }

  /** Admin-only: delete an item by id. */
  async deleteItem(id: string): Promise<{ success: boolean } | null> {
    return apiFetch<{ success: boolean }>(
      `${API_BASE_URL}/public-dashboard/items/${id}`,
      { method: "DELETE" },
    );
  }
}
