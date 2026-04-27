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
  DemographicEntry,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import { GrowthResponse } from '../types/chatbot.type.js';

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
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
  kccAwareness: DemographicEntry[];
  agriAppUsage: DemographicEntry[];
}

export interface IChatbotService {
  getDashboard(days: number, source?: string, userType?: string): Promise<DashboardResponse>;
  getKpiSummary(source?: string, userType?: string): Promise<KpiSummary>;
  getDailyActiveUsers(days: number, source?: string, userType?: string): Promise<DailyActiveUsersEntry[]>;
  getChannelSplit(source?: string): Promise<ChannelSplitEntry[]>;
  getVoiceAccuracyByLanguage(source?: string): Promise<VoiceAccuracyEntry[]>;
  getGeoDistribution(source?: string): Promise<GeoStateEntry[]>;
  getQueryCategories(source?: string): Promise<QueryCategoryEntry[]>;
  getTopCrops(): Promise<{ totalQuestions: number, topCrops: {name: string, count: number}[] }>;
  getWeeklyAvgSessionDuration(weeks?: number, source?: string): Promise<WeeklySessionDurationEntry[]>;
  getDailyQueryCounts(days?: number, source?: string, userType?: string): Promise<DailyQueryCountEntry[]>;
  getTodayQueryCount(source?: string, userType?: string): Promise<number>;
  getWeeklyQueryCounts(source?: string, userType?: string): Promise<WeeklyQueryCountEntry[]>;
  getDailyUserTrend(days?: number, source?: string, userType?: string): Promise<DailyActiveUsersEntry[]>;
  getUserDetails(startDate?: string, endDate?: string, page?: number, limit?: number, search?: string, source?: string, crop?: string, village?: string, profileCompleted?: string, inactiveOnly?: boolean, userType?: string): Promise<PaginatedUserDetails>;
  getAvgSessionDurationV2(source?: string, userType?: string): Promise<number>;
  getWeeklyAvgSessionDurationV2(weeks?: number, source?: string, userType?: string): Promise<WeeklySessionDurationEntry[]>;
  generateChatbotExcelReport(startDate: Date, endDate: Date, source?: string): Promise<ArrayBuffer | null>;
  getGrowth(range:number):Promise<GrowthResponse>
}

