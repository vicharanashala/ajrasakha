export interface AnalyticsOverview {
  total_gdb_entries: number;
  total_feedback_captured: number;
  voice_feedback_count: number;
  overall_upvotes: number;
  overall_downvotes: number;
  overall_helpful_ratio: number;
  overall_helpful_percentage: number;
  total_flagged_for_review: number;
  active_threshold: number;
  min_response_criteria: number;
}

export interface DomainAnalyticsItem {
  domain: string;
  total: number;
  upvotes: number;
  downvotes: number;
  helpful_ratio: number;
  helpful_percentage: number;
}

export interface StateAnalyticsItem {
  state: string;
  total: number;
  upvotes: number;
  downvotes: number;
  helpful_ratio: number;
  helpful_percentage: number;
}

export interface RootCauseItem {
  category: string;
  label: string;
  count: number;
  percentage: number;
}

export interface FlagInfo {
  threshold_configured?: number;
  min_samples_configured?: number;
  flagged_at?: string;
  primary_negative_state?: string;
  root_cause_breakdown?: Record<string, string | number>;
  flag_reason?: string | null;
  review_status?: 'PENDING_AGRI_REVIEW' | 'PENDING_REVIEW' | 'RE_VALIDATED' | 'RESOLVED' | 'SENT_TO_ACE_PIPELINE' | string;
  assigned_team?: string;
  revised_answer_hi?: string | null;
  revised_answer_en?: string | null;
  reviewer_note?: string | null;
  resolved_at?: string | null;
  is_resolved?: boolean;
  resolved?: boolean;
  resolution_action?: string;
  resolved_by?: string;
}

export interface FlaggedEntry {
  _id?: string;
  gdb_id: string;
  crop: string;
  domain: string;
  sub_domain?: string;
  question_en: string;
  question_hi: string;
  answer_en: string;
  answer_hi: string;
  upvotes: number;
  downvotes: number;
  total_responses?: number;
  helpful_ratio?: number;
  helpful_percentage?: number;
  flagged_at?: string;
  review_status: 'PENDING_REVIEW' | 'PENDING_AGRI_REVIEW' | 'RESOLVED' | 'RE_VALIDATED' | string;
  root_cause_breakdown?: Record<string, string | number>;
  primary_state?: string;
  primary_negative_state?: string;
  revised_answer_hi?: string;
  revised_answer_en?: string;
  reviewer_note?: string;
  resolved_at?: string | null;
  is_flagged?: boolean;
  is_resolved?: boolean;
  status?: 'ACTIVE' | 'FLAGGED_REVIEW' | 'FLAGGED' | 'RE_VALIDATED' | string;
  flag_info?: FlagInfo | null;
  metrics?: Record<string, any>;
}

export interface FlaggedConfig {
  helpful_threshold: number;
  min_responses: number;
}

export interface GdbEntry {
  _id: string;
  crop: string;
  domain: string;
  sub_domain?: string;
  question_en: string;
  question_hi: string;
  answer_en: string;
  answer_hi: string;
  technical_level?: string;
  status: 'ACTIVE' | 'FLAGGED_REVIEW' | 'UNDER_REVISION' | 'RE_VALIDATED' | string;
  upvotes: number;
  downvotes: number;
  primary_state?: string;
  metrics?: {
    total_responses?: number;
    total_feedback?: number;
    helpful_ratio?: number;
    helpful_percentage?: number;
  };
  is_flagged: boolean;
  flag_info: FlagInfo | null;
}

export interface WhatsAppQuickButton {
  id?: string;
  title: string;
  payload?: number;
  value?: number;
}

export interface RootCauseOption {
  id?: string;
  code?: string;
  label?: string;
  label_hi?: string;
  label_en?: string;
}

export interface VoiceAnalysis {
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  rating: number;
  confidence?: number;
  detected_intent?: string;
}

export interface WhatsAppSimulateResponse {
  step: 'ANSWER_DELIVERED' | 'FEEDBACK_RECORDED' | 'ROOT_CAUSE_RECORDED' | 'SCHEDULED_NUDGE_SENT' | 'ERROR' | string;
  bot_response_text?: string;
  outgoing_messages?: string[];
  answer_text?: string;
  prompt_text?: string;
  gdb_id?: string;
  crop?: string;
  quick_reply_buttons?: WhatsAppQuickButton[];
  root_cause_options?: RootCauseOption[];
  voice_analysis?: VoiceAnalysis;
  scheduled_evening_nudge?: boolean;
  is_new_question_on_open_session?: boolean;
}

export interface FarmerSession {
  phone_number: string;
  current_state: string;
  active_gdb_id?: string | null;
  last_query?: string | null;
  nudge_scheduled?: boolean;
  language?: string;
  state?: string;
  last_interaction_time?: string;
}

export interface WeeklyDigestItem {
  digest_id: string;
  reporting_period?: string;
  generated_at: string;
  summary?: {
    total_feedback?: number;
    voice_notes_count?: number;
    overall_helpful_pct?: number;
    flagged_entries_count?: number;
    status_headline?: string;
  };
  critical_action_items?: string[] | Array<{
    gdb_id?: string;
    crop?: string;
    issue?: string;
    helpful_percentage?: number;
    recommended_action?: string;
  }>;
  lowest_performing_gdb_entries?: Array<{
    gdb_id: string;
    crop?: string;
    domain?: string;
    question?: string;
    question_hi?: string;
    helpful_percentage?: number;
    total_responses?: number;
    upvotes?: number;
    downvotes?: number;
    status?: string;
    top_complaint?: string;
  }>;
  root_cause_distribution?: RootCauseItem[];
  domain_breakdown?: DomainAnalyticsItem[];
  state_breakdown?: StateAnalyticsItem[];
  metrics_snapshot?: {
    total_evaluations?: number;
    system_wide_helpfulness?: number;
    flagged_in_pipeline?: number;
  };
  executive_summary?: string;
}

export interface DailyForecastItem {
  date: string;
  max_temp: number;
  min_temp: number;
  rain_prob: number;
  condition: string;
  condition_hi: string;
}

export interface WeatherZone {
  id: string;
  city: string;
  agro_zone: string;
  status: string;
  status_desc: string;
  temp: number;
  apparent_temp?: number;
  wind: string;
  humidity: string;
  precipitation?: string;
  condition: string;
  major_crops: string;
  advisory: string;
  forecast?: DailyForecastItem[];
  crop_advisory?: CropSmartAdvisoryResponse;
}

export interface WeatherAlertsResponse {
  zones: WeatherZone[];
  active_location?: WeatherZone;
}

export interface AdvisorySection {
  badge: string;
  title: string;
  details: string;
}

export interface CropSmartAdvisoryResponse {
  crop_label: string;
  spray_window?: AdvisorySection;
  irrigation?: AdvisorySection;
  pest_index?: AdvisorySection;
  // Fallback compatibility
  crop?: string;
  advisory?: string;
  imd_risk_level?: string;
  action_checklist?: string[];
}
