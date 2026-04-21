import type {
  KpiSummary,
  DailyActiveUsersEntry,
  ChannelSplitEntry,
  VoiceAccuracyEntry,
  GeoStateEntry,
  QueryCategoryEntry,
  WeeklySessionDurationEntry,
  DailyQueryCountEntry,
  WeeklyQueryCountEntry,
  UserDetailEntry,
  PaginatedUserDetails,
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
  weeklyQueries: WeeklyQueryCountEntry[];
}

export interface IChatbotService {
  getDashboard(days: number, source?: string): Promise<DashboardResponse>;
  getKpiSummary(source?: string): Promise<KpiSummary>;
  getDailyActiveUsers(days: number, source?: string): Promise<DailyActiveUsersEntry[]>;
  getChannelSplit(source?: string): Promise<ChannelSplitEntry[]>;
  getVoiceAccuracyByLanguage(source?: string): Promise<VoiceAccuracyEntry[]>;
  getGeoDistribution(source?: string): Promise<GeoStateEntry[]>;
  getQueryCategories(source?: string): Promise<QueryCategoryEntry[]>;
  getWeeklyAvgSessionDuration(weeks?: number, source?: string): Promise<WeeklySessionDurationEntry[]>;
  getDailyQueryCounts(days?: number, source?: string): Promise<DailyQueryCountEntry[]>;
  getTodayQueryCount(source?: string): Promise<number>;
  getWeeklyQueryCounts(source?: string): Promise<WeeklyQueryCountEntry[]>;
  getDailyUserTrend(days?: number, source?: string): Promise<DailyActiveUsersEntry[]>;
  getUserDetails(startDate?: string, endDate?: string, page?: number, limit?: number, search?: string, source?: string, crop?: string, village?: string, profileCompleted?: string): Promise<PaginatedUserDetails>;
  getAvgSessionDurationV2(source?: string): Promise<number>;
  getWeeklyAvgSessionDurationV2(weeks?: number, source?: string): Promise<WeeklySessionDurationEntry[]>;
}

