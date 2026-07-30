import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

/** Well-known item names (must match the backend). */
export const SATURATION_LIMIT_NAME = "saturation limit crop";
export const OUTREACH_VIDEO_NAME = "outreach video";
export const OUTREACH_IMAGE_NAME = "outreach image";

/** Homepage hero statistics — admin-editable single-value items. */
export const STAT_QUESTIONS_COLLECTED = "stat questions collected";
export const STAT_QUESTIONS_REFINED = "stat questions refined";
export const STAT_LANGUAGES_SUPPORTED = "stat languages supported";
export const STAT_KVKS_COVERED = "stat kvks covered";
export const STAT_AGROCLIMATIC_ZONES = "stat agroclimatic zones";

/**
 * Descriptor for each admin-editable homepage stat: the canonical item `name`, the label
 * shown on the public dashboard, and the fallback value used until an admin sets it.
 * Shared by the public dashboard (reader) and the admin edit modal (writer).
 */
export const HOMEPAGE_STATS: {
  name: string;
  label: string;
  defaultValue: string;
}[] = [
  { name: STAT_QUESTIONS_COLLECTED, label: "Questions collected", defaultValue: "45M+" },
  { name: STAT_QUESTIONS_REFINED, label: "Questions refined", defaultValue: "70,741" },
  { name: STAT_LANGUAGES_SUPPORTED, label: "Languages Supported", defaultValue: "22" },
  { name: STAT_KVKS_COVERED, label: "KVKs covered", defaultValue: "731" },
  { name: STAT_AGROCLIMATIC_ZONES, label: "Agroclimatic Zones", defaultValue: "126" },
];

export interface SaturatedCrop {
  crop: string;
  count: number;
  /** Count of closed-status questions for this crop. */
  closed?: number;
  /** Count of in-progress (open + delayed) questions for this crop. */
  inProgress?: number;
}

export interface SaturatedCropStateItem {
  state: string;
  total: number;
  /** Sum of closed-status question counts across the state's saturated crops. */
  closed?: number;
  /** Sum of in-progress (open + delayed) question counts across the state's saturated crops. */
  inProgress?: number;
  crops: SaturatedCrop[];
}

export interface SaturatedCropsApiResponse {
  saturationLimit?: number;
  states?: SaturatedCropStateItem[];
}

/** Public-facing subset of an active user for the public dashboard. */
export interface PublicUserItem {
  firstName: string;
  lastName?: string;
  preference?: {
    state?: string;
    district?: string;
    language?: string;
    role?: string;
    crops?: string[];
  } | null;
  avatar?: string;
  role: string;
  university?: string;
  createdAt?: string;
}

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
  private _baseUrl = `${API_BASE_URL}/public-dashboard`;

  /** Public read of active users. */
  async getUsers(): Promise<PublicUserItem[] | null> {
    return apiFetch<PublicUserItem[]>(
      `${API_BASE_URL}/public-dashboard/users`,
    );
  }

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

  /** Admin-only: upload an image/video file to GCS; stores its URL as an item. */
  async uploadMedia(
    file: File,
    type: "image" | "video",
  ): Promise<PublicDashboardItem | null> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", type);
    return apiFetch<PublicDashboardItem>(
      `${API_BASE_URL}/public-dashboard/media`,
      { method: "POST", body: formData },
    );
  }
  async getSaturatedCrops(): Promise<SaturatedCropsApiResponse | SaturatedCropStateItem[] | null> {
    try {
      const data = await apiFetch<SaturatedCropsApiResponse | SaturatedCropStateItem[]>(`${this._baseUrl}/saturated-crops`);
      return data;
    } catch (err) {
      console.warn("Could not fetch saturated crops from backend API:", err);
      return null;
    }
  }
}

export const publicDashboardService = new PublicDashboardService();
