import { apiFetch } from "../api/api-fetch";
import { env } from "@/config/env";

const API_BASE_URL = env.apiBaseUrl();

export interface CoverageItem {
  name: string;
  count: number;
}

/** The four headline counts — cheap, polled for near-real-time updates. */
export interface PublicDashboardCounts {
  /** Every question in the collection, any status — total questions processed. */
  totalQuestions: number;
  /** Questions in a closed state: closed + dynamic_closed + duplicate_closed. */
  validatedQAPairs: number;
  /** Questions that entered the DB since midnight IST (any status). */
  questionsToday: number;
  /** Questions that entered the DB since the 1st of the month, IST (any status). */
  questionsThisMonth: number;
}

/** One role and how many users currently hold it (PAEs, reviewers, moderators, …). */
export interface RoleCount {
  role: string;
  count: number;
}

/** Live figures for the public dashboard (no auth). */
export interface PublicDashboardStats extends PublicDashboardCounts {
  statesCovered: number;
  cropsCovered: number;
  domainsCovered: number;
  stateData: CoverageItem[];
  cropData: CoverageItem[];
  domainData: CoverageItem[];
  /** Human Intelligence Network headcounts (from performance/overview's userRoleOverview). */
  userRoleOverview: RoleCount[];
}

export class PublicStatsService {
  /** Public — served by DashboardContentController. The heavy call (includes coverage). */
  async get(): Promise<PublicDashboardStats | null> {
    return apiFetch<PublicDashboardStats>(`${API_BASE_URL}/dashboard/stats`);
  }

  /** Public — the cheap counts only, meant to be polled. */
  async getCounts(): Promise<PublicDashboardCounts | null> {
    return apiFetch<PublicDashboardCounts>(`${API_BASE_URL}/dashboard/counts`);
  }
}
