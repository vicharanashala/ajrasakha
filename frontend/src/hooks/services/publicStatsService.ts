import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface CoverageItem {
  name: string;
  count: number;
}

/** Live figures for the public dashboard (no auth). */
export interface PublicDashboardStats {
  /** Every question in the collection, any status — total questions processed. */
  totalQuestions: number;
  /** Questions in a closed state: closed + dynamic_closed + duplicate_closed. */
  validatedQAPairs: number;
  /** Questions that entered the DB since midnight IST (any status). */
  questionsToday: number;
  /** Questions that entered the DB since the 1st of the month, IST (any status). */
  questionsThisMonth: number;
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
