// Mirrors the report dict built by apis/acc_api/gap_detector.py::build_gap_report.
// Field names are snake_case because the FastAPI endpoint returns the pipeline's
// plain dict as-is (see GET /gdb/gap-report in apis/acc_api/main.py).

export interface GapItem {
  cluster_id: string;
  cluster_name: string;
  size: number;
  keywords: string[];
  sample_queries: string[];
  domains: string[];
  states: string[];
  crop: string;
  growth_rate: number;
  priority_score: number;
  farmer_demand: number;
  recommended_action: string;
  priority_level: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export type CoverageStatus = "good" | "partial" | "gap";

export interface HeatmapCell {
  crop: string;
  state: string;
  domain: string;
  gdb_count: number;
  disclaimer_count: number;
  coverage_score: number;
  status: CoverageStatus;
}

export interface CoverageStats {
  heatmap: HeatmapCell[];
  total_combinations: number;
  covered: number;
  partial: number;
  gaps: number;
}

export interface OutreachRecommendation {
  target_state: string;
  focus_domain: string;
  gap_questions: number;
  recommendation: string;
  priority: "HIGH" | "MEDIUM";
}

export interface DomainGapTotal {
  domain: string;
  gap_count: number;
}

export interface StateGapTotal {
  state: string;
  gap_count: number;
}

export interface GapReport {
  report_type: string;
  period_days: number;
  start_date: string;
  end_date: string;
  generated_at: string;
  total_disclaimers: number;
  unique_queries: number;
  clusters_found: number;
  top_gaps: GapItem[];
  coverage_stats: CoverageStats;
  outreach_recommendations: OutreachRecommendation[];
  domains_with_gaps: DomainGapTotal[];
  states_with_gaps: StateGapTotal[];
}
