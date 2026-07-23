/**
 * GDB Coverage Intelligence API
 * Talks to the FastAPI acc_api /gdb/gap-report endpoint.
 */
import { env } from "@/config/env";

const ACC_API = (env.accApiUrl() || "").replace(/\/$/, "");

async function _handleResponse(res: Response) {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body.detail) detail = body.detail;
    } catch {
      // ignore parse error
    }
    throw new Error(detail);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GapKpis {
  total_unanswered_queries: number;
  priority_gaps: number;
  fastest_growing_topic: string;
  regions_with_gaps: number;
}

export interface PriorityGap {
  rank: number;
  cluster_id: number;
  size: number;
  representative_question: string;
  sample_questions: string[];
  crop: string;
  state: string;
  domain: string;
  current_demand: number;
  previous_demand: number;
  growth: number;
  total_demand: number;
  priority_score: number;
  priority_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface CoverageRow {
  crop: string;
  state: string;
  domain: string;
  unanswered_demand: number;
  gdb_entry_count: number;
  coverage_level: "STRONG" | "PARTIAL" | "GAP";
}

export interface OutreachRecommendation {
  state: string;
  crop: string;
  domain: string;
  unanswered_demand: number;
  coverage_severity: "STRONG" | "PARTIAL" | "GAP";
  gdb_entry_count: number;
  urgency: "URGENT" | "MODERATE" | "ADVISORY";
  recommendation: string;
}

export interface GapReport {
  generated_at: string;
  kpis: GapKpis;
  top_gaps: PriorityGap[];
  coverage: CoverageRow[];
  outreach_recommendations: OutreachRecommendation[];
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function fetchGapReport(refresh = false): Promise<GapReport> {
  const url = `${ACC_API}/gdb/gap-report${refresh ? "?refresh=true" : ""}`;
  const res = await fetch(url);
  return _handleResponse(res);
}
