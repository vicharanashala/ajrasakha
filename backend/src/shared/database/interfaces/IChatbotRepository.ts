import type { ClientSession } from 'mongodb';

// ─── Shared return types ──────────────────────────────────────────────────────

export interface KpiSummary {
  dau: number;
  dailyQueries: number;
  avgSessionDurationMin: number;
  csatRating: number;
  repeatQueryRatePct: number;
  voiceUsageSharePct: number;
}

export interface DailyActiveUsersEntry {
  day: string; // 'YYYY-MM-DD'
  count: number;
}

export interface ChannelSplitEntry {
  channel: string;
  pct: number;
}

export interface VoiceAccuracyEntry {
  lang: string;
  pct: number;
}

export interface GeoStateEntry {
  state: string;
  count: number;
}

export interface QueryCategoryEntry {
  label: string;
  pct: number;
}

export interface WeeklySessionDurationEntry {
  week: string; // ISO week string, e.g. '2025-W03'
  avgSessionDurationMin: number;
}

// ─── Single consolidated interface ───────────────────────────────────────────

export interface IChatbotRepository {
  /** Aggregated KPI summary for the current day. */
  getKpiSummary(session?: ClientSession): Promise<KpiSummary>;

  /** Daily unique active users over the last `days` days. */
  getDailyActiveUsers(days: number, session?: ClientSession): Promise<DailyActiveUsersEntry[]>;

  /** Percentage breakdown of sessions by channel (voice / text / kcc_agent / ivrs). */
  getChannelSplit(session?: ClientSession): Promise<ChannelSplitEntry[]>;

  /** Average voice recognition accuracy grouped by language. */
  getVoiceAccuracyByLanguage(session?: ClientSession): Promise<VoiceAccuracyEntry[]>;

  /** Session counts grouped by state abbreviation, sorted descending. */
  getGeoDistribution(session?: ClientSession): Promise<GeoStateEntry[]>;

  /** Percentage breakdown of sessions by query category, sorted descending. */
  getQueryCategories(session?: ClientSession): Promise<QueryCategoryEntry[]>;

  /** Weekly avg session duration (updatedAt - createdAt) over the last `weeks` ISO weeks, sorted ascending. */
  getWeeklyAvgSessionDuration(weeks?: number, session?: ClientSession): Promise<WeeklySessionDurationEntry[]>;
}
