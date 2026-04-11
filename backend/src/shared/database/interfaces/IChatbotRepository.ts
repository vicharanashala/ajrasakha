import type {ClientSession} from 'mongodb';

// ─── Shared return types ──────────────────────────────────────────────────────

export interface KpiSummary {
  dau: number; // total users (all time)
  dauLastMonthPct: number; // % change: this month's new users vs last month's new users
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

export interface DailyQueryCountEntry {
  day: string; // 'YYYY-MM-DD'
  count: number;
}

export interface WeeklyQueryCountEntry {
  week: string; // ISO week string, e.g. '2025-W03'
  count: number;
}

// ─── Single consolidated interface ───────────────────────────────────────────

export interface IChatbotRepository {
  /** Aggregated KPI summary for the current day. */
  getKpiSummary(session?: ClientSession): Promise<KpiSummary>;

  /** Daily unique active users over the last `days` days. */
  getDailyActiveUsers(
    days: number,
    session?: ClientSession,
  ): Promise<DailyActiveUsersEntry[]>;

  /** Percentage breakdown of sessions by channel (voice / text / kcc_agent / ivrs). */
  getChannelSplit(session?: ClientSession): Promise<ChannelSplitEntry[]>;

  /** Average voice recognition accuracy grouped by language. */
  getVoiceAccuracyByLanguage(
    session?: ClientSession,
  ): Promise<VoiceAccuracyEntry[]>;

  /** Session counts grouped by state abbreviation, sorted descending. */
  getGeoDistribution(session?: ClientSession): Promise<GeoStateEntry[]>;

  /** Percentage breakdown of sessions by query category, sorted descending. */
  getQueryCategories(session?: ClientSession): Promise<QueryCategoryEntry[]>;

  /** Weekly avg session duration (updatedAt - createdAt) over the last `weeks` ISO weeks, sorted ascending. */
  getWeeklyAvgSessionDuration(
    weeks?: number,
    session?: ClientSession,
  ): Promise<WeeklySessionDurationEntry[]>;

  /** Daily user-message counts from the messages collection over the last `days` days, sorted ascending. */
  getDailyQueryCounts(
    days?: number,
    session?: ClientSession,
  ): Promise<DailyQueryCountEntry[]>;

  /** Count of user messages created today from the messages collection. */
  getTodayQueryCount(session?: ClientSession): Promise<number>;

  /** Weekly query totals (all-time) from the messages collection, sorted ascending by ISO week. */
  getWeeklyQueryCounts(
    session?: ClientSession,
  ): Promise<WeeklyQueryCountEntry[]>;

  /** Daily user activity trend (users active per day) over the last `days` days, sorted ascending. */
  getDailyUserTrend(
    days?: number,
    session?: ClientSession,
  ): Promise<DailyActiveUsersEntry[]>;
  findMatchingMessages(data: {question: string; details: any; createdAt: Date,questionId:string});
  findFromSecondDb(data: {question: string; details: any; createdAt: Date,questionId:string});
  findByMessageId(messageId: string, session?: ClientSession): Promise<any>;
  findBySecondDbMessageId(messageId: string, session?: ClientSession): Promise<any>;
}
