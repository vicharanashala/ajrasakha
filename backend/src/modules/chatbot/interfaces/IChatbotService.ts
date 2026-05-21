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
  PlatformInstallEntry,
  DuplicateQuestionEntry,
  DomainSpikeEntry,
  MonthlyQueryCountEntry,
  MonthlySessionDurationEntry,
  DistrictAnalyticsEntry,
  FeedbackData,
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
  monthlySessionDuration: MonthlySessionDurationEntry[];
  dailyQueries: DailyQueryCountEntry[];
  weeklyQueries: WeeklyQueryCountEntry[];
  monthlyQueries: MonthlyQueryCountEntry[];
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
  kccAwareness: DemographicEntry[];
  agriAppUsage: DemographicEntry[];
  platformInstalls: PlatformInstallEntry[];
  domainSpikes: DomainSpikeEntry[];
  feedbackData: FeedbackData;
  dailyQuestionTrends?: Array<{ day: string; uniqueCount: number; duplicateCount: number }>;
  topFaqs?: Array<{ question: string; count: number }>;
  topQuestionsFromCollection?: Array<{ question: string; count: number }>;
}

export interface IChatbotService {
  getDashboard(
    days: number,
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<DashboardResponse>;
  getKpiSummary(source?: string, userType?: string): Promise<KpiSummary>;
  getDailyActiveUsers(days: number, source?: string, userType?: string): Promise<DailyActiveUsersEntry[]>;
  getChannelSplit(source?: string): Promise<ChannelSplitEntry[]>;
  getVoiceAccuracyByLanguage(source?: string): Promise<VoiceAccuracyEntry[]>;
  getGeoDistribution(source?: string): Promise<GeoStateEntry[]>;
  getQueryCategories(source?: string, userType?: string): Promise<QueryCategoryEntry[]>;
  getTopCrops(): Promise<{ totalQuestions: number, topCrops: {name: string, count: number}[] }>;
  getWeeklyAvgSessionDuration(weeks?: number, source?: string): Promise<WeeklySessionDurationEntry[]>;
  getDailyQueryCounts(days?: number, source?: string, userType?: string): Promise<DailyQueryCountEntry[]>;
  getTodayQueryCount(source?: string, userType?: string): Promise<number>;
  getWeeklyQueryCounts(source?: string, userType?: string): Promise<WeeklyQueryCountEntry[]>;
  getDailyUserTrend(days?: number, source?: string, userType?: string): Promise<DailyActiveUsersEntry[]>;
  getUserDetails(startDate?: string, endDate?: string, page?: number, limit?: number, search?: string, source?: string, crop?: string, village?: string, profileCompleted?: string, inactiveOnly?: boolean, lowFeedbackOnly?: boolean, userType?: string,sortBy?:string, sortOrder?:string): Promise<PaginatedUserDetails>;
  getAvgSessionDurationV2(source?: string, userType?: string): Promise<number>;
  getWeeklyAvgSessionDurationV2(weeks?: number, source?: string, userType?: string): Promise<WeeklySessionDurationEntry[]>;
  generateChatbotExcelReport(startDate: Date, endDate: Date, source?: string): Promise<ArrayBuffer | null>;
  getGrowth(range:number,startDate?: Date, endDate?: Date):Promise<GrowthResponse>
  getDuplicateQuestions(source?: string): Promise<DuplicateQuestionEntry[]>;
  getDomainSpikes(days?: number): Promise<DomainSpikeEntry[]>;
  getDailyQuestionTrends(days?: number, userType?: string): Promise<Array<{ day: string; uniqueCount: number; duplicateCount: number }>>;
  getTopFaqs(source?: string, userType?: string): Promise<Array<{ question: string; count: number }>>;
  getDistrictAnalyticsByState(state: string, source?: string, userType?: string): Promise<DistrictAnalyticsEntry[]>;
  deleteUser(userId: string, source: string): Promise<boolean>;
  getDailyActiveUsersTrend(startDate: Date, endDate: Date, source: string, userType: string):Promise<any>;
  getMonthlyActiveUsersTrend(startDate: Date, endDate: Date, source: string, userType: string): Promise<any>;
  getWeeklyActiveUsersTrend(startDate: Date, endDate: Date, source: string, userType: string): Promise<any>;
  getRetentionMetrics(): Promise<any>;
}

