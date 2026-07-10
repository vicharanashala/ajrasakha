import type {
  KpiSummary,
  DailyActiveUsersEntry,
  ChannelSplitEntry,
  VoiceAccuracyEntry,
  GeoStateEntry,
  QueryCategoryEntry,
  PaginatedQueryCategoryQuestions,
  QueryCategoryQuestionType,
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
  UnverifiedUserEntry,
  FarmerHeatMapFilters,
  FarmerHeatMapResponse,
  CoordinatorDuplicateQuestionHeatMapResponse,
  PaginatedFeedbackMessages,
} from '#root/shared/database/interfaces/IChatbotRepository.js';
import {GrowthResponse} from '../types/chatbot.type.js';

export interface DashboardResponse {
  kpi?: KpiSummary;
  dau?: DailyActiveUsersEntry[];
  channelSplit?: ChannelSplitEntry[];
  voiceAccuracy?: VoiceAccuracyEntry[];
  geo?: GeoStateEntry[];
  queryCategories?: QueryCategoryEntry[];
  weeklySessionDuration?: WeeklySessionDurationEntry[];
  monthlySessionDuration?: MonthlySessionDurationEntry[];
  dailyQueries?: any[];
  weeklyQueries?: any[];
  monthlyQueries?: any[];
  ageGroups?: DemographicEntry[];
  genderSplit?: DemographicEntry[];
  farmingExperience?: DemographicEntry[];
  kccAwareness?: DemographicEntry[];
  agriAppUsage?: DemographicEntry[];
  landHolding?: DemographicEntry[];
  platformInstalls?: PlatformInstallEntry[];
  domainSpikes?: DomainSpikeEntry[];
  feedbackData?: FeedbackData;
  responseAdherenceTable?: ResponseAdherenceTable;
  dailyQuestionTrends?: Array<{
    day: string;
    uniqueCount: number;
    duplicateCount: number;
  }>;
  topFaqs?: Array<{question: string; count: number}>;
  topQuestionsFromCollection?: Array<{question: string; count: number}>;
  querySummaries?: {
    daily: {label: string; totalQueries: number};
    weekly: {label: string; totalQueries: number};
    monthly: {label: string; totalQueries: number};
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
  getFeedbackUsers(
    source?: string,
    page?: number,
    limit?: number,
    search?: string,
    sortBy?: string,
    sortOrder?: string,
    userType?: string,
    rating?: string,
    tag?: string,
  ): Promise<PaginatedFeedbackMessages>;

  getDashboard(
    days: number,
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<DashboardResponse>;
  getKpiSummary(source?: string, userType?: string): Promise<KpiSummary>;
  getDailyActiveUsers(
    days: number,
    source?: string,
    userType?: string,
  ): Promise<DailyActiveUsersEntry[]>;
  getChannelSplit(source?: string): Promise<ChannelSplitEntry[]>;
  getVoiceAccuracyByLanguage(source?: string): Promise<VoiceAccuracyEntry[]>;
  getGeoDistribution(source?: string): Promise<GeoStateEntry[]>;
  getQueryCategories(
    source?: string,
    userType?: string,
  ): Promise<QueryCategoryEntry[]>;
  getQueryCategoryQuestions(
    category: string,
    questionType?: QueryCategoryQuestionType,
    page?: number,
    limit?: number,
    source?: string,
    userType?: string,
    search?: string,
  ): Promise<PaginatedQueryCategoryQuestions>;
  getQuestionFromDistrict(
    district: string,
    state?: string,
    questionType?: QueryCategoryQuestionType,
    page?: number,
    limit?: number,
    source?: string,
    userType?: string,
    search?: string,
    knownDistricts?: string[],
  ): Promise<any>;
  getTopCrops(source?: string, userType?: string): Promise<{ totalQuestions: number, topCrops: {name: string, count: number}[] }>;
  getQuestionsByCrop(crop: string, crops?:string[], questionType?: QueryCategoryQuestionType, page?: number, limit?: number, source?: string, userType?: string, search?: string): Promise<any>
  getWeeklyAvgSessionDuration(weeks?: number, source?: string): Promise<WeeklySessionDurationEntry[]>;
  getDailyAnalytics(month?: string, source?: string, userType?: string): Promise<any[]>;
  getTodayQueryCount(source?: string, userType?: string): Promise<number>;
  getWeeklyAnalytics(
    month?: string,
    source?: string,
    userType?: string,
  ): Promise<any[]>;
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
  getUserDetails(startDate?: string, endDate?: string, page?: number, limit?: number, search?: string, source?: string, crop?: string, primaryCrops?: string, secondaryCrops?: string, village?: string, state?: string, district?: string, block?: string, profileCompleted?: string, inactiveOnly?: boolean, lowFeedbackOnly?: boolean, userType?: string, roles?: string, sortBy?:string, sortOrder?:string, activeTodayByProfile?: boolean, missingDemographicField?: string, isVerified?: boolean, loginStatus?: 'all' | 'loggedIn' | 'loggedOut'): Promise<PaginatedUserDetails>;
  getUsersByDemographic(
    category: string,
    value: string,
    source?: string,
    userType?: string,
    page?: number,
    limit?: number,
    search?: string,
    sortBy?: string,
    sortOrder?: string,
  ): Promise<PaginatedUserDetails>;
  getUsersByPlatform(
    platform: string,
    source?: string,
    page?: number,
    limit?: number,
    search?: string,
    sortBy?: string,
    sortOrder?: string,
    userType?: string,
  ): Promise<PaginatedUserDetails>;
  getAvgSessionDurationV2(source?: string, userType?: string): Promise<number>;
  getWeeklyAvgSessionDurationV2(
    weeks?: number,
    source?: string,
    userType?: string,
  ): Promise<WeeklySessionDurationEntry[]>;
  // generateChatbotExcelReport(startDate: Date, endDate: Date, source?: string): Promise<ArrayBuffer | null>;

  generateChatbotAnalyticsPdfReport(
    startDate: Date,
    endDate: Date,
    source?: string,
    state?: string,
  ): Promise<Buffer>;
  generateChatbotAnalyticsExcelReport(
    startDate: Date,
    endDate: Date,
    state: string,
    source?: string,
  ): Promise<ArrayBuffer | null>;
  getGrowth(
    source: string,
    usertType: string,
    range: number,
    startDate?: Date,
    endDate?: Date,
  ): Promise<GrowthResponse>;
  getDuplicateQuestions(source?: string): Promise<DuplicateQuestionEntry[]>;
  getDomainSpikes(days?: number): Promise<DomainSpikeEntry[]>;
  getDailyQuestionTrends(
    days?: number,
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{day: string; uniqueCount: number; duplicateCount: number}>>;
  getUsersMetrics(source?: string, userType?: string): Promise<any>;
  getTopFaqs(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{question: string; count: number}>>;
  getDistrictAnalyticsByState(
    state: string,
    selectedStateCode?: string,
    source?: string,
    userType?: string,
  ): Promise<DistrictAnalyticsEntry[]>;
  getWeatherConcernAnalytics(
    filters?: WeatherConcernAnalyticsFilters,
    source?: string,
    userType?: string,
  ): Promise<WeatherConcernAnalyticsResponse>;
  getWeatherConcernQueries(
    filters: WeatherConcernAnalyticsFilters,
    concern: string,
    page: number,
    limit: number,
    source?: string,
    userType?: string,
    search?: string,
  ): Promise<PaginatedQueryCategoryQuestions>;
  getFarmerHeatMapAnalytics(
    filters?: FarmerHeatMapFilters,
  ): Promise<FarmerHeatMapResponse>;

  getCoordinatorDuplicateQuestionHeatMap(
    coordinatorId: string,
  ): Promise<CoordinatorDuplicateQuestionHeatMapResponse>;
  getUserById(userId: string, source: string): Promise<any>;
  deleteUser(userId: string, source: string): Promise<boolean>;
  updateUser(
    userId: string,
    source: string,
    data: {
      name?: string;
      userRole?: string;
      farmerProfile?: {
        farmerName?: string;
        age?: number;
        gender?: string;
        villageName?: string;
        blockName?: string;
        district?: string;
        state?: string;
        phoneNo?: string;
        nearestKVK?: string;
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
        landhold?: number;
      };
    },
  ): Promise<boolean>;
  changeUserPassword(
    userId: string,
    source: string,
    newPassword: string,
    keepLoggedIn: boolean,
  ): Promise<boolean>;
  addUser(
    source: string,
    data: {
      email: string;
      name: string;
      password: string;
      userRole?: string;
      isVerified?: boolean;
    },
  ): Promise<boolean>;
  // getDailyActiveUsersTrend(source: string, userType: string,startDate?: Date, endDate?: Date ):Promise<any>;
  // getMonthlyActiveUsersTrend(source: string, userType: string,startDate?: Date, endDate?: Date ): Promise<any>;
  // getWeeklyActiveUsersTrend(source: string, userType: string,startDate?: Date, endDate?: Date ): Promise<any>;
  getRetentionMetrics(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any>;
  getUserQuestionsData(
    userEmail: string,
    source?: string,
    userType?: string,
    page?: number,
    limit?: number,
  ): Promise<any>;
  notifyUser(
    userEmail: string,
    messageId: string,
    message: string,
  ): Promise<any>;

  getClosedAndNotifedData(
    source?: string,
    userType?: string,
    startDate?: string,
    endDate?: string,
  ): Promise<any>;
  getMonthlyChurnRate(source: string, userType: string): Promise<any>;
  getActiveUsersTrend(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<
    {
      _id: string;
      activeUsers: number;
    }[]
  >;
  getTopQuestionsFromCollection(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<any>;
  getRepeatQueryCount(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<any>;
  getAllUnverifiedUsers(
    page?: number,
    limit?: number,
    search?: string,
    source?: string,
  ): Promise<{
    users: UnverifiedUserEntry[];
    totalUsers: number;
    totalPages: number;
  }>;
  verifyUser(userId: string, source?: string, isVerified?: boolean): Promise<any>;
  getResponseAdherenceTable(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<ResponseAdherenceTable>;

  getQuestionsByStatus(        
    status?: string,
    page?: number,
    limit?: number,
    source?: string,
    userType?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date): Promise<any>

  getQuestionsClosedWithinTwoHours(
    page?: number,
    limit?: number,
    source?: string,
    userType?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date,
    isPassed?: string,
    tag?: string,
  ) : Promise<any>

  getQuestionsByNotificationStatus(
    notificationType:string,
    page: number,
    limit: number,
    source: string,
    userType?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any>

    getQueriesByPeriod (
      period: string,
      page:number,
      limit: number,
      source: string,
      userType?: string,
      search?: string,
    ): Promise<any>

    // getStateQuestionsAndUsersData(  
    //   state: string,
    //   source: string,
    //   userType: string
    // ): Promise<any>

    getAllStatesQuestionsAndUsersData(
      source: string,
      userType: string,
    ): Promise<any>
  getUserProfile(userId: string): Promise<any>
  assignUsers(userId: string, targetIds: string[]): Promise<any>
  unAssignUsers(userId: string, targetIds: string[]): Promise<any>

    getVillageUserCounts(
    state: string,
    district: string,
    source: string,
    userType: string
  ): Promise<any>
  
  getQuestionLifecycle(questionId: string): Promise<any>



      getQuestionFromState(
      state?: string,
      questionType?: QueryCategoryQuestionType,
      page?: number,
      limit?: number,
      source?: string,
      userType?: string,
      search?: string,
    ): Promise<any>;

    getActiveUsersDetails(
      page:number,
      limit:number,
      source: string,
      userType: string,
      state?: string,
      district?: string,
      search?: string,
    ): Promise<any>

      getCoordinatorsDetails(
      page:number,
      limit:number,
      source: string,
      userType: string,
      state?: string,
      district?: string,
      search?: string,
): Promise<any>

  getLifeCycleSummary(
      status?: string,
      source?: string,
      userType?: string,
      startDate?: Date,
      endDate?: Date,
      isPassed?: string,
      tag?: string,
      notificationType?: string,
      page?: number,
      limit?: number,
    ): Promise<any>

  getFeedbackByLocation(
    source: string,
    page: number,
    limit: number,
    sortBy: string,
    sortOrder: string,
    userType: string,
    rating?: string,
    state?: string,
    district?: string,
    search?: string,
  ) : Promise<any>
}
