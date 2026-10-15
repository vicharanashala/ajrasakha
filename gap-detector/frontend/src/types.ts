// Mirrors backend/app/models.py (only the fields the dashboard reads).

export type Priority = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type CellStatus = "good" | "partial" | "gap";

export interface GapSummary {
  run_id: string;
  generated_at: string;
  period_days: number;
  total_disclaimers: number;
  unique_queries: number;
  clusters_found: number;
  coverage: { cells: number; good: number; partial: number; gap: number };
  top_gap: string | null;
  critical_gaps: number;
}

export interface TopGap {
  cluster_id: string;
  cluster_name: string;
  size: number;
  keywords: string[];
  sample_queries: string[];
  domains: string[];
  states: string[];
  crops: string[];
  growth_rate: number;
  priority_score: number;
  first_seen: string | null;
  last_seen: string | null;
  farmer_demand: number;
  recommended_action: string;
  priority_level: Priority;
}

export interface HeatmapCell {
  domain: string;
  state: string;
  crop: string | null;
  gdb_count: number;
  disclaimer_count: number;
  coverage_score: number;
  status: CellStatus;
}

export interface Outreach {
  target_state: string;
  focus_domain: string;
  gap_questions: number;
  recommendation: string;
  priority: Priority;
}

export interface GapReport {
  run_id: string;
  period_days: number;
  start_date: string;
  end_date: string;
  generated_at: string;
  total_disclaimers: number;
  unique_queries: number;
  clusters_found: number;
  excluded_non_agricultural: number;
  excluded_test_traffic: number;
  top_gaps: TopGap[];
  coverage_stats: { heatmap: HeatmapCell[]; total_combinations: number; covered: number; partial: number; gaps: number };
  outreach_recommendations: Outreach[];
  domains_with_gaps: { domain: string; gap_count: number }[];
  states_with_gaps: { state: string; gap_count: number }[];
  crops_with_gaps: { crop: string; gap_count: number }[];
}

export interface Cluster {
  cluster_id: string;
  title: string;
  size: number;
  unique_farmers: number;
  weekly_counts: number[];
  growth_rate: number;
  gap_score: number;
  priority_level: Priority;
  domain_distribution: Record<string, number>;
  state_distribution: Record<string, number>;
  crop_distribution: Record<string, number>;
  representative_queries: string[];
}
