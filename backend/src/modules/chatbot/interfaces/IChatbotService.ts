import type {
  KpiSummary,
  DailyActiveUsersEntry,
  ChannelSplitEntry,
  VoiceAccuracyEntry,
  GeoStateEntry,
  QueryCategoryEntry,
  WeeklySessionDurationEntry,
  PaginatedUserDetails,
  DemographicEntry,
  PlatformInstallEntry,
  DuplicateQuestionEntry,
  DomainSpikeEntry,
  MonthlySessionDurationEntry,
  DistrictAnalyticsEntry,
  FeedbackData,
  ResponseAdherenceTable,
  WeatherConcernAnalyticsFilters,
  WeatherConcernAnalyticsResponse,
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
  dailyQueries: any[];
  weeklyQueries: any[];
  monthlyQueries: any[];
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
  kccAwareness: DemographicEntry[];
  agriAppUsage: DemographicEntry[];
  platformInstalls: PlatformInstallEntry[];
  domainSpikes: DomainSpikeEntry[];
  feedbackData: FeedbackData;
  responseAdherenceTable?: ResponseAdherenceTable;
  dailyQuestionTrends?: Array<{ day: string; uniqueCount: number; duplicateCount: number }>;
  topFaqs?: Array<{ question: string; count: number }>;
  topQuestionsFromCollection?: Array<{ question: string; count: number }>;
  querySummaries?: {
    daily: { label: string; totalQueries: number };
    weekly: { label: string; totalQueries: number };
    monthly: { label: string; totalQueries: number };
  };
}

export interface QueryAnalyticsResponse {
  data: any[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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
  getTopCrops(source?: string): Promise<{ totalQuestions: number, topCrops: {name: string, count: number}[] }>;
  getWeeklyAvgSessionDuration(weeks?: number, source?: string): Promise<WeeklySessionDurationEntry[]>;
  getDailyAnalytics(month?: string, source?: string, userType?: string): Promise<any[]>;
  getTodayQueryCount(source?: string, userType?: string): Promise<number>;
  getWeeklyAnalytics(month?: string, source?: string, userType?: string): Promise<any[]>;
  getMonthlyAnalytics(source?: string, userType?: string): Promise<any[]>;
  getQueryAnalytics(
    period: 'daily' | 'weekly' | 'monthly',
    options: {
      month?: string;
      year?: number;
      page?: number;
      limit?: number;
      source?: string;
      userType?: string;
    },
  ): Promise<QueryAnalyticsResponse>;
  getDailyUserTrend(days?: number, source?: string, userType?: string): Promise<DailyActiveUsersEntry[]>;
  getUserDetails(startDate?: string, endDate?: string, page?: number, limit?: number, search?: string, source?: string, crop?: string, village?: string, profileCompleted?: string, inactiveOnly?: boolean, lowFeedbackOnly?: boolean, userType?: string,sortBy?:string, sortOrder?:string): Promise<PaginatedUserDetails>;
  getAvgSessionDurationV2(source?: string, userType?: string): Promise<number>;
  getWeeklyAvgSessionDurationV2(weeks?: number, source?: string, userType?: string): Promise<WeeklySessionDurationEntry[]>;
  // generateChatbotExcelReport(startDate: Date, endDate: Date, source?: string): Promise<ArrayBuffer | null>;

  generateChatbotAnalyticsPdfReport(startDate: Date, endDate: Date, source?:string, state?:string):Promise<Buffer>;
  generateChatbotAnalyticsExcelReport(startDate: Date, endDate: Date, state:string, source?: string):Promise<ArrayBuffer | null>;
  getGrowth(source: string, range:number,startDate?: Date, endDate?: Date):Promise<GrowthResponse>
  getDuplicateQuestions(source?: string): Promise<DuplicateQuestionEntry[]>;
  getDomainSpikes(days?: number): Promise<DomainSpikeEntry[]>;
  getDailyQuestionTrends(days?: number, userType?: string): Promise<Array<{ day: string; uniqueCount: number; duplicateCount: number }>>;
  getTopFaqs(source?: string, userType?: string): Promise<Array<{ question: string; count: number }>>;
  getDistrictAnalyticsByState(state: string, source?: string, userType?: string): Promise<DistrictAnalyticsEntry[]>;
  getWeatherConcernAnalytics(filters?: WeatherConcernAnalyticsFilters, source?: string, userType?: string): Promise<WeatherConcernAnalyticsResponse>;
  deleteUser(userId: string, source: string): Promise<boolean>;
  updateUser(
    userId: string,
    source: string,
    data: {
      name?: string;
      role?: string;
      farmerProfile?: {
        farmerName?: string;
        age?: number;
        gender?: string;
        villageName?: string;
        blockName?: string;
        district?: string;
        state?: string;
        phoneNo?: string;
        languagePreference?: string;
        yearsOfExperience?: number;
        cropsCultivated?: string[];
        primaryCrop?: string;
        secondaryCrop?: string;
        awarenessOfKCC?: boolean;
        usesAgriApps?: boolean;
        highestEducatedPerson?: string;
        numberOfSmartphones?: number;
        platform?: string;
      };
    },
  ): Promise<boolean>;
  addUser(
    source: string,
    data: {
      email: string;
      name: string;
      role?: string;
    },
  ): Promise<boolean>;
  getDailyActiveUsersTrend(startDate: Date, endDate: Date, source: string, userType: string):Promise<any>;
  getMonthlyActiveUsersTrend(startDate: Date, endDate: Date, source: string, userType: string): Promise<any>;
  getWeeklyActiveUsersTrend(startDate: Date, endDate: Date, source: string, userType: string): Promise<any>;
  getRetentionMetrics(  
      startDate: Date,
      endDate: Date,
      source: string,
      userType: string,
      requestType: string,): Promise<any>;
  getUserQuestionsData(userEmail: string, source?: string, userType?: string, page?: number, limit?: number): Promise<any>;
  getClosedAndNotifedData(source?: string): Promise<any> 
}
