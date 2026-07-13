import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface CoverageItem {
  name: string;
  count: number;
}

/** Live figures for the public dashboard (no auth). */
export interface PublicDashboardStats {
  /** Questions in a closed state: closed + dynamic_closed + duplicate_closed. */
  validatedQAPairs: number;
  statesCovered: number;
  cropsCovered: number;
  domainsCovered: number;
  stateData: CoverageItem[];
  cropData: CoverageItem[];
  domainData: CoverageItem[];
}

export class PublicStatsService {
  /** Public — served by DashboardContentController. */
  async get(): Promise<PublicDashboardStats | null> {
    return apiFetch<PublicDashboardStats>(`${API_BASE_URL}/dashboard/stats`);
  }
}
