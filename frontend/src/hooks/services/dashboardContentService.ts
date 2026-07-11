import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

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

export interface DashboardContent {
  key?: string;
  blocks: DashboardBlock[];
  updatedAt?: string;
  updatedBy?: string | null;
}

export class DashboardContentService {
  private _baseUrl = `${API_BASE_URL}/dashboard-content`;

  /** Public read — no auth required. */
  async get(): Promise<DashboardContent | null> {
    return apiFetch<DashboardContent>(this._baseUrl);
  }

  /** Admin/moderator write. */
  async update(blocks: DashboardBlock[]): Promise<DashboardContent | null> {
    return apiFetch<DashboardContent>(this._baseUrl, {
      method: "PUT",
      body: JSON.stringify({ blocks }),
    });
  }
}
