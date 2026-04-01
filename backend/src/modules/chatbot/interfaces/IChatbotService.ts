import type {
  KpiSummary,
  DailyActiveUsersEntry,
  ChannelSplitEntry,
  VoiceAccuracyEntry,
  GeoStateEntry,
  QueryCategoryEntry,
  WeeklySessionDurationEntry,
  DailyQueryCountEntry,
} from '#root/shared/database/interfaces/IChatbotRepository.js';

export interface DashboardResponse {
  kpi: KpiSummary;
  dau: DailyActiveUsersEntry[];
  channelSplit: ChannelSplitEntry[];
  voiceAccuracy: VoiceAccuracyEntry[];
  geo: GeoStateEntry[];
  queryCategories: QueryCategoryEntry[];
  weeklySessionDuration: WeeklySessionDurationEntry[];
  dailyQueries: DailyQueryCountEntry[];
}

export interface IChatbotService {
  getDashboard(days: number): Promise<DashboardResponse>;
  getKpiSummary(): Promise<KpiSummary>;
  getDailyActiveUsers(days: number): Promise<DailyActiveUsersEntry[]>;
  getChannelSplit(): Promise<ChannelSplitEntry[]>;
  getVoiceAccuracyByLanguage(): Promise<VoiceAccuracyEntry[]>;
  getGeoDistribution(): Promise<GeoStateEntry[]>;
  getQueryCategories(): Promise<QueryCategoryEntry[]>;
  getWeeklyAvgSessionDuration(weeks?: number): Promise<WeeklySessionDurationEntry[]>;
  getDailyQueryCounts(days?: number): Promise<DailyQueryCountEntry[]>;
  getTodayQueryCount(): Promise<number>;
}
