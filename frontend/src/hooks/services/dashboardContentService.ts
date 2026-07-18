import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";
import type { MediaItem } from "./mediaService";

const API_BASE_URL = env.apiBaseUrl();

export interface DashboardFigure {
  label: string;
  value: string;
}

export interface DashboardBlock {
  id: string;
  heading: string;
  body: string;
  figures: DashboardFigure[];
  order: number;
}

/** A headline figure in the snapshot grid (e.g. "Total Languages Supported"). */
export interface DashboardStat {
  id: string;
  label: string;
  /** Free text: a raw number ("18600000" — animated) or a formatted string ("18.6M"). */
  value: string;
  order: number;
}

export interface DashboardContent {
  key?: string;
  blocks: DashboardBlock[];
  stats?: DashboardStat[];
  /** Carousel + outreach media, stored inline with the content (URLs already signed). */
  media?: MediaItem[];
  updatedAt?: string;
  updatedBy?: string | null;
}

export class DashboardContentService {
  private _baseUrl = `${API_BASE_URL}/dashboard`;

  /** Public read — no auth. */
  async get(): Promise<DashboardContent | null> {
    return apiFetch<DashboardContent>(`${this._baseUrl}/content`);
  }

  /** Admin/moderator write — replaces the narrative blocks and the headline stats. */
  async update(
    blocks: DashboardBlock[],
    stats: DashboardStat[],
  ): Promise<DashboardContent | null> {
    return apiFetch<DashboardContent>(`${this._baseUrl}/content`, {
      method: "PUT",
      body: JSON.stringify({ blocks, stats }),
    });
  }
}
