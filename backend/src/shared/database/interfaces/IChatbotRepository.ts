import { ILocationDistrict, ILocationState } from '#root/modules/lgd/interfaces/ILocationService.js';
import type {ClientSession, ObjectId} from 'mongodb';

// ─── Shared return types ──────────────────────────────────────────────────────

export interface KpiSummary {
  dau?: number; // total users (all time)
  dauLastMonthPct?: number; // % change: this month's new users vs last month's new users
  dailyQueries?: number;
  avgSessionDurationMin?: number;
  csatRating?: number;
  // repeatQueryRatePct: number;
  voiceUsageSharePct?: number;
  totalAppInstalls?: number; // It will the count the user whose profile is completed or not.
  inactiveUsersLast3Days?: number; // users with zero messages in the last 3 days
  duplicateQuestionsCount?: number; // questions with a similarityScore field
  lowFeedbackUsersCount?: number; // users who have never given any feedback (no feedback object in messages)
  // avgQuestionsPerUserDay?: number;
  // repeatQueryCount?: number;
}

export interface DuplicateQuestionEntry {
  questionId: string;
  userId?: string;
  question: string;
  referenceQuestion: string;
  similarityScore: number;
  createdAt: Date;
  farmerName: string;
  email: string;
  village: string;
  block: string;
  district: string;
  state: string;
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
  questionCount: number;
  duplicateQuestionCount: number;
}

export type QueryCategoryQuestionType = 'all' | 'unique' | 'duplicate';

export interface QueryCategoryQuestionEntry {
  questionId: string;
  question: string;
  status: string;
  questionType: 'unique' | 'duplicate';
  category: string;
  createdAt?: Date;
  farmerName?: string;
  email?: string;
  crop?: string;
  village?: string;
  block?: string;
  district?: string;
  state?: string;
}

export interface PaginatedQueryCategoryQuestions {
  questions: QueryCategoryQuestionEntry[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface DistrictAnalyticsEntry {
  district: string;
  totalQuestions: number;
  // closedQuestions: number;
  uniqueQuestions: number;
  duplicateQuestions: number;
  totalUsers: number
  activeUsers: number
  coordinators: number
}

export interface WeatherConcernAnalyticsFilters {
  season?: string;
  state?: string;
  district?: string;
  block?: string;
  village?: string;
  startDate?: string;
  endDate?: string;
}

export interface WeatherConcernDistributionEntry {
  concern: string;
  count: number;
  percentage: number;
}

export interface WeatherConcernTimelineEntry {
  month: string;
  count: number;
}

export interface WeatherConcernAnalyticsResponse {
  filters: WeatherConcernAnalyticsFilters;
  summary: {
    totalWeatherQueries: number;
    topConcern: string | null;
  };
  concernDistribution: WeatherConcernDistributionEntry[];
  timeline: WeatherConcernTimelineEntry[];
}

export type FarmerHeatMapGranularity =
  | 'monthly'
  | 'weekly'
  | 'daily'
  | 'hourly';

export interface FarmerHeatMapFilters {
  source?: string;
  userType?: string;
  state?: string;
  district?: string;
  block?: string;
  village?: string;
  granularity?: FarmerHeatMapGranularity;
  startDate?: string;
  endDate?: string;
}

export type FarmerHeatMapLocationScope =
  | 'state'
  | 'district'
  | 'block'
  | 'village';

export interface FarmerHeatMapLocationHierarchy {
  scope: FarmerHeatMapLocationScope;
  labels: string[];
}

export interface FarmerHeatMapMetricTotals {
  activeFarmers: number;
  totalQuestions: number;
  duplicateQuestions: number;
  closedQuestions: number;
  nonGdbQuestions: number;
  notifiedQuestions: number;
  averageClosureTimeMinutes: number;
}

export interface FarmerHeatMapBucket {
  key: string;
  label: string;
  startDate: string;
  endDate: string;
  totals: FarmerHeatMapMetricTotals;
}

export interface FarmerHeatMapQuestionDetail {
  questionId: string;
  question: string;
  status: string;
  askedBy?: string;
  email?: string;
  userId?: string;
  state?: string;
  district?: string;
  block?: string;
  village?: string;
  crop?: string;
  domain?: string;
  createdAt?: Date;
  isCustomerNotified?: boolean;
  referenceQuestionId?: string;
  referenceQuestion?: string;
}

export interface FarmerHeatMapCell {
  bucket: string;
  label: string;
  activeFarmers: number;
  totalQuestions: number;
  duplicateQuestions: number;
  closedQuestions: number;
  nonGdbQuestions: number;
  notifiedQuestions: number;
  averageClosureTimeMinutes: number;
  statusDistribution: Record<string, number>;
  questionDetails: FarmerHeatMapQuestionDetail[];
}

export interface FarmerHeatMapRow {
  id: string;
  label: string;
  scope: FarmerHeatMapLocationScope;
  cells: FarmerHeatMapCell[];
  totals: FarmerHeatMapMetricTotals;
}

export interface FarmerHeatMapResponse {
  filters: FarmerHeatMapFilters;
  buckets: FarmerHeatMapBucket[];
  rows: FarmerHeatMapRow[];
  totals: FarmerHeatMapMetricTotals;
  maxValues: {
    activeFarmers: number;
    totalQuestions: number;
    duplicateQuestions: number;
    closedQuestions: number;
    nonGdbQuestions: number;
    notifiedQuestions: number;
    averageClosureTimeMinutes: number;
  };
}

export interface CoordinatorDuplicateQuestionDetail {
  question: string;
  repeatCount: number;
  userId: string;
  userName?: string;
  email?: string;
  block?: string;
  village?: string;
  firstAskedAt?: Date;
  lastAskedAt?: Date;
  questionIds: string[];
}

export interface CoordinatorDuplicateQuestionVillage {
  village: string;
  count: number;
  details: CoordinatorDuplicateQuestionDetail[];
}

export interface CoordinatorDuplicateQuestionBlock {
  block: string;
  count: number;
  villages: CoordinatorDuplicateQuestionVillage[];
}

export interface CoordinatorDuplicateQuestionLocationHierarchy {
  blocks: {
    block: string;
    villages: string[];
  }[];
}

export interface CoordinatorDuplicateQuestionHeatMapResponse {
  coordinatorId: string;
  coordinatorRole: string;
  scope: 'district' | 'block' | 'village';
  state?: string;
  district?: string;
  block?: string;
  totalDuplicateQuestions: number;
  blocks: CoordinatorDuplicateQuestionBlock[];
}

export interface WeeklySessionDurationEntry {
  week: string; // ISO week string, e.g. '2025-W03'
  avgSessionDurationMin: number;
}

export interface MonthlySessionDurationEntry {
  month: string; // 'YYYY-MM'
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

export interface MonthlyQueryCountEntry {
  month: string; // 'YYYY-MM'
  count: number;
}

export interface FeedbackEntry {
  rating: string;
  tag: string;
}

export interface FeedbackData {
  positiveFeedbacks: FeedbackEntry[];
  negativeFeedbacks: FeedbackEntry[];
  positiveFeedbackCounts: {tag: string; count: any}[];
  negativeFeedbackCounts: {tag: string; count: any}[];
  stats: {
    _id?: null | ObjectId;
    positiveCount: number;
    negativeCount: number;
    averageRating: number;
    totalFeedbacks: number;
  };
}

export interface FeedbackMessageEntry {
  _id: string;
  conversationId: string;
  userId?: string;
  farmerName?: string;
  email?: string;
  village?: string;
  block?: string;
  district?: string;
  state?: string;
  questionId?: string;
  question: string;
  response: string;
  feedback: {
    rating: string;
    tag?: string;
    details?: string;
  };
  createdAt: Date;
}

export interface PaginatedFeedbackMessages {
  messages: FeedbackMessageEntry[];
  totalFeedbacks: number;
  totalPages: number;
  currentPage: number;
}

export interface FarmerProfile {
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
  platformHistory?: {os: string; timestamp: string}[];
  location?: {
    latitude: number;
    longitude: number;
  };
  landhold?: number;
}

export interface UserDetailEntry {
  userId: string;
  name: string;
  email: string;
  role?: string;
  userRole?: string;
  totalQuestions: number;
  activeSessionCount?: number;
  farmerProfile?: FarmerProfile;
  createdAt: Date;
  isVerified?: boolean;
}

export interface PaginatedUserDetails {
  users: UserDetailEntry[];
  totalUsers: number;
  totalPages: number;
  currentPage?: number;
  page?: number;
  limit?: number;
  userRoleCounts?: {farmer: number, coordinator: number, internal: number}
  activeUsers?: number;
  inactiveUsers?: number;
  totalQuestions?: number;
}

export interface UnverifiedUserEntry {
  _id: string;
  name: string;
  username?: string;
  email: string;
  createdAt?: Date;
  role?: string;
}

export interface DemographicEntry {
  label: string;
  count: number;
  pct: number;
}

export interface UserDemographics {
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
  landHolding: DemographicEntry[];
}

export interface KccAndAgriAppStats {
  kccAwareness: DemographicEntry[];
  agriAppUsage: DemographicEntry[];
}

export interface PlatformInstallEntry {
  platform: string;
  count: number;
}

export interface DomainSpikeEntry {
  domain: string;
  date: string; // 'YYYY-MM-DD'
  count: number; // query count on that date
  baseline: number; // rolling 30-day average (excluding the spike day)
  spikePct: number; // % above baseline, rounded
  location?: string; // most common "District, State" for that domain+date
}

export interface ResponseAdherenceTable {
  date: string;
  time: string;
  timeWindow: string;
  whatsappQueriesAsked: number;
  ajrasakhaQueriesAsked: number;
  manualQueriesAsked: number;
  whatsappPushedToReviewer: number;
  ajrasakhaPushedToReviewer: number;
  manualPushedToReviewer: number;
  whatsappAnsweredWithin120Min: number;
  ajrasakhaAnsweredWithin120Min: number;
  manualAnsweredWithin120Min: number;
  whatsappPassedQuestions: number;
  ajrasakhaPassedQuestions: number;
  manualPassedQuestions: number;
  whatsappMarkedDuplicate: number;
  ajrasakhaMarkedDuplicate: number;
  manualMarkedDuplicate: number;
  whatsappDynamicWeather: number;
  ajrasakhaDynamicWeather: number;
  manualDynamicWeather: number;
  whatsappDynamicMarket: number;
  ajrasakhaDynamicMarket: number;
  manualDynamicMarket: number;
  whatsappDynamicSchemes: number;
  ajrasakhaDynamicSchemes: number;
  manualDynamicSchemes: number;
  // whatsappNonGdbWithin120: number;
  // ajrasakhaNonGdbWithin120: number;
  // manualNonGdbWithin120: number;
  whatsappInReview: number;
  ajrasakhaInReview: number;
  manualInReview: number;
  whatsappOpen: number;
  ajrasakhaOpen: number;
  manualOpen: number;
  whatsappDelayed: number;
  ajrasakhaDelayed: number;
  manualDelayed: number;

          whatsappClosedCount: number;
        whatsappPendingCount: number;
        whatsappNonAgriCount: number;
        whatsappDynamicCount: number;
        whatsappDuplicateCount: number;
        whatsappHoldCount: number;
        whatsappPaeSubmitedCount: number;
        whatsappDynamicCLosedCount: number;
        whatsappReroutedCount: number;
        whatsappPassCount: number;
        whatsappDuplicateClosedCount: number;

      ajrasakhaClosedCount: number;
    ajrasakhaPendingCount: number;
    ajrasakhaNonAgriCount: number;
    ajrasakhaDynamicCount: number;
    ajrasakhaDuplicateCount: number;
    ajrasakhaHoldCount: number;
    ajrasakhaPaeSubmitedCount:number;
    ajrasakhaDynamicCLosedCount: number;
    ajrasakhaReroutedCount: number;
    ajrasakhaPassCount: number;
    ajrasakhaDuplicateClosedCount:number;

      manualClosedCount: number;
    manualPendingCount: number;
    manualNonAgriCount:number;
    manualDynamicCount: number;
    manualDuplicateCount: number;
    manualHoldCount: number;
    manualPaeSubmitedCount:number;
    manualDynamicCLosedCount: number;
    manualReroutedCount: number;
    manualPassCount: number;
    manualDuplicateClosedCount:number;
          manualAverageResponseGBDMinutes: number;
    manualAverageResponseNonGBDMinutes: number;
            whatsappAverageResponseGBDMinutes: number;
        whatsappAverageResponseNonGBDMinutes: number;
            ajrasakhaAverageResponseGBDMinutes: number,
    ajrasakhaAverageResponseNonGBDMinutes: number;

  whatsappAverageResponseMinutes: number;
  ajrasakhaAverageResponseMinutes: number;
  manualAverageResponseMinutes: number;
  whatsappAdherencePct: number;
  ajrasakhaAdherencePct: number;
  manualAdherencePct: number;
  manualTotal?: number;
  agriexpertTotal?: number;
  outreachTotal?: number;
  answeredWithin120MinClosedwhatsapp: number,
  answeredWithin120MinPasswhatsapp: number,
  answeredWithin120MinDynamicClosedwhatsapp: number,
  answeredWithin120MinDuplicateClosedwhatsapp: number,
  answeredWithin120MinClosedajrasakha: number,
  answeredWithin120MinPassajrasakha: number,
  answeredWithin120MinDynamicClosedajrasakha: number,
  answeredWithin120MinDuplicateClosedajrasakha: number,
  answeredWithin120MinClosedmanual: number,
  answeredWithin120MinPassmanual: number,
  answeredWithin120MinDynamicClosedmanual: number,
  answeredWithin120MinDuplicateClosedmanual: number,

  whatsappdynamicWeatherDynamicCount: number;
  whatsappdynamicWeatherStaticDynamicCount: number;
  ajrasakhadynamicWeatherDynamicCount: number;
  ajrasakhadynamicWeatherStaticDynamicCount: number;
  manualdynamicWeatherDynamicCount: number;
  manualdynamicWeatherStaticDynamicCount: number;

  whatsappdynamicMarketDynamicCount: number;
  whatsappdynamicMarketStaticDynamicCount: number;
  ajrasakhadynamicMarketDynamicCount: number;
  ajrasakhadynamicMarketStaticDynamicCount: number;
  manualdynamicMarketDynamicCount: number;
  manualdynamicMarketStaticDynamicCount: number;

  whatsappdynamicSchemesDynamicCount: number;
  whatsappdynamicSchemesStaticDynamicCount: number;
  ajrasakhadynamicSchemesDynamicCount: number;
  ajrasakhadynamicSchemesStaticDynamicCount: number;
  manualdynamicSchemesDynamicCount: number;
  manualdynamicSchemesStaticDynamicCount: number;

  totalDynamicWhatsappCount: number;
  totalDynamicAjrasakhaCount: number;
  totalDynamicManualCount: number;

  totalStaticDynamicWhatsappCount: number;
  totalStaticDynamicAjrasakhaCount: number;
  totalStaticDynamicManualCount: number;
}

// ─── Single consolidated interface ───────────────────────────────────────────

export interface IChatbotRepository {
  /** Aggregated KPI summary for the current day. */
  getKpiSummary(
    source?: string,
    session?: ClientSession,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<KpiSummary>;

  /** Daily unique active users over the last `days` days. */
  getDailyActiveUsers(
    days: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<DailyActiveUsersEntry[]>;

  /** Percentage breakdown of sessions by channel (voice / text / kcc_agent / ivrs). */
  getChannelSplit(
    source?: string,
    session?: ClientSession,
  ): Promise<ChannelSplitEntry[]>;

  /** Average voice recognition accuracy grouped by language. */
  getVoiceAccuracyByLanguage(
    source?: string,
    session?: ClientSession,
  ): Promise<VoiceAccuracyEntry[]>;

  /** Session counts grouped by state abbreviation, sorted descending. */
  getGeoDistribution(
    source?: string,
    session?: ClientSession,
  ): Promise<GeoStateEntry[]>;

  /** Percentage breakdown of sessions by query category, sorted descending. */
  getQueryCategories(
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<QueryCategoryEntry[]>;

  getQueryCategoryQuestions(
    category: string,
    questionType?: QueryCategoryQuestionType,
    page?: number,
    limit?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
    search?: string,
  ): Promise<PaginatedQueryCategoryQuestions>;

  getWeatherConcernQueries(
    filters: WeatherConcernAnalyticsFilters,
    concern: string,
    page: number,
    limit: number,
    source: 'vicharanashala' | 'annam' | 'whatsapp',
    session?: ClientSession,
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
    session?: ClientSession,
    userType?: string,
    search?: string,
    knownDistricts?: string[],
    startDate?: Date,
    endDate?: Date
  ): Promise<any>;

  getTopCrops(
    source?: string,
    userType?: string,
    session?: ClientSession,
  ): Promise<{
    totalQuestions: number;
    topCrops: {name: string; count: number}[];
  }>;

  // getQuestionsByCrop(
  //   crop: string,
  //   questionType?: QueryCategoryQuestionType,
  //   page?: number,
  //   limit?: number,
  //   source?: string,
  //   session?: ClientSession,
  //   userType?: string,
  //   search?: string,
  // ): Promise<any>;

  getQuestionsByStatus(
    status: string,
    page?: number,
    limit?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date,
    userId?: string
  ): Promise<any>;

  // getQuestionsByCrop(
  //   crop: string,
  //   questionType?: QueryCategoryQuestionType,
  //   page?: number,
  //   limit?: number,
  //   source?: string,
  //   session?: ClientSession,
  //   userType?: string,
  //   search?: string,
  // ): Promise<any>;

    getQuestionsByCrop(crop: string, crops?: string[] ,questionType?: QueryCategoryQuestionType, page?: number, limit?: number, source?: string, session?: ClientSession, userType?: string, search?: string): Promise<any>

  /** Weekly avg session duration (updatedAt - createdAt) over the last `weeks` ISO weeks, sorted ascending. */
  getWeeklyAvgSessionDuration(
    weeks?: number,
    source?: string,
    session?: ClientSession,
  ): Promise<WeeklySessionDurationEntry[]>;

  getDailyAnalytics(
    month?: string,
    source?: string,
    session?: ClientSession,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<any[]>;

  /** Count of user messages created today from the messages collection. */
  getTodayQueryCount(
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<number>;

  getWeeklyAnalytics(
    month?: string,
    source?: string,
    session?: ClientSession,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<any[]>;

  getMonthlyAnalytics(
    source?: string,
    session?: ClientSession,
    userType?: string,
    year?: number,
  ): Promise<any[]>;

  /** Daily user activity trend (users active per day) over the last `days` days, sorted ascending. */
  getDailyUserTrend(
    days?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<DailyActiveUsersEntry[]>;
  findMatchingMessages(data: {
    question: string;
    details: any;
    createdAt: Date;
    questionId: string;
    messageId?: string | undefined;
  });
  findFromSecondDb(data: {
    question: string;
    details: any;
    createdAt: Date;
    questionId: string;
    messageId?: string | undefined;
  });

  /** Inactivity-gap based avg session duration in minutes (KPI number). Requires MongoDB 5.0+. */
  getAvgSessionDurationV2(
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<number>;

  /** Inactivity-gap based weekly avg session duration for sparkline/delta. Requires MongoDB 5.0+. */
  getWeeklyAvgSessionDurationV2(
    weeks?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<WeeklySessionDurationEntry[]>;

  getMonthlyAvgSessionDuration(
    weeks?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<MonthlySessionDurationEntry[]>;

  /** Get all users with their question counts, optionally filtered by date range, with server-side pagination. */
  getUserDetails(
    startDate?: Date,
    endDate?: Date,
    page?: number,
    limit?: number,
    search?: string,
    source?: string,
    crop?: string,
    primaryCrops?: string,
    secondaryCrops?: string,
    village?: string,
    state?: string,
    district?: string,
    block?: string,
    profileCompleted?: string,
    inactiveOnly?: boolean,
    session?: ClientSession,
    userType?: string,
    roles?: string,
    sortBy?: string,
    sortOrder?: string,
    lowFeedbackOnly?: boolean,
    activeTodayByProfile?: boolean,
    missingDemographicField?: string,
    isVerified?: boolean,
    fromMap?: boolean,
    loginStatus?: 'all' | 'loggedIn' | 'loggedOut',
  ): Promise<PaginatedUserDetails>;

  getUserQuestionsData(
      identifiers: {
    threadIds?: string[];
    messageIds?: string[];
    userId?: string;
  },
    source?: string,
    userType?: string,
    page?: number,
    limit?: number,
  ): Promise<any>;

  getUserMessageMetricDetails(
    userId: string,
    metric: string,
    page?: number,
    limit?: number,
    session?: ClientSession,
  ): Promise<any>;

  getUsersMessages(
    email: string,
    source?: string,
    session?: ClientSession,
    userType?: string,
    page?: number,
    limit?: number,
  ): Promise<any>;

  getUserData(
    userEmail: string,
    source: string,
    session?: ClientSession,
  ): Promise<{userId: string; name: string}>;

  getAllUserMessageIds(
    email: string,
    source?: string,
    session?: ClientSession,
  ): Promise<string[]>;

  /** Aggregate conversations from the messages collection for Excel export. */
  generateChatbotExcelReport(
    startDate: Date,
    endDate: Date,
    source?: string,
    session?: ClientSession,
  ): Promise<ChatbotConversationData[]>;

  generateChatBotData(
    startDate: Date,
    endDate: Date,
    days: number,
    userType: string,
    month?: string,
    districts?: ILocationDistrict[],
    state?: string,
    source?: string,
    session?: ClientSession,
  );

  /** Aggregate age group, gender split, and farming experience distributions from farmerProfile. */
  getUserDemographics(
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<UserDemographics>;

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
    session?: ClientSession,
  ): Promise<PaginatedUserDetails>;

  /** Aggregate KCC policy awareness and agri app usage splits from farmerProfile. */
  getKccAndAgriAppStats(
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<KccAndAgriAppStats>;

  getIdsCreated(userType: string, startDate:Date,endDate:Date, session?: ClientSession)
  getInstalls(userType: string, startDate:Date,endDate:Date, session?: ClientSession)
  getActiveUsers(userType: string, startDate:Date,endDate:Date, session?: ClientSession)

  getFeedbackData(
    source?: string,
    session?: ClientSession,
    userType?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<FeedbackData>;

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
    session?: ClientSession,
  ): Promise<PaginatedFeedbackMessages>;

  // get platform wise installs
  getPlatformInstalls(
    source: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<PlatformInstallEntry[]>;

  getUsersByPlatform(
    platform: string,
    source?: string,
    page?: number,
    limit?: number,
    search?: string,
    sortBy?: string,
    sortOrder?: string,
    userType?: string,
    session?: ClientSession,
  ): Promise<PaginatedUserDetails>;

  /** Duplicate questions (questions with a similarityScore) enriched with farmer details. */
  getDuplicateQuestions(
    source?: string,
    session?: ClientSession,
  ): Promise<DuplicateQuestionEntry[]>;

  /** Domain query spikes: days where a domain's question count is ≥2× its 30-day rolling average. */
  getDomainSpikes(
    days?: number,
    session?: ClientSession,
  ): Promise<DomainSpikeEntry[]>;

  /** Daily unique vs duplicate questions asked on the review system (source AJRASAKHA). */
  getDailyQuestionTrends(
    days?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{day: string; uniqueCount: number; duplicateCount: number}>>;

  /** 10 most frequently asked questions from the messages collection. */
  getTopFaqs(
    source?: string,
    session?: ClientSession,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{question: string; count: number}>>;

  /** 10 most frequently asked questions from the questions collection. */
  getTopQuestionsFromCollection(
    source?: string,
    session?: ClientSession,
    userType?: string,
    startTime?: string,
    endTime?: string,
  ): Promise<Array<{questionId: string; question: string; count: number}>>;

  /** Get documents for a specific top question drill-down. */
  getTopQuestionInstances(
    questionId: string,
    dbSource?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
    page?: number,
    limit?: number,
    session?: ClientSession,
  ): Promise<{ data: any[]; total: number; page: number; limit: number; totalPages: number }>;
  getResponseAdherenceTable(
    session?: ClientSession,
    userType?: string,
    startTime?: string,
    endTime?: string,
    source?: string,
  ): Promise<ResponseAdherenceTable>;
  getDistrictAnalyticsByState(
    state: string,
    districts?: ILocationDistrict[],
    source?: string,
    session?: ClientSession,
    userType?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<DistrictAnalyticsEntry[]>;

  getWeatherConcernAnalytics(
    filters?: WeatherConcernAnalyticsFilters,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<WeatherConcernAnalyticsResponse>;

  getFarmerHeatMapAnalytics(
    filters?: FarmerHeatMapFilters,
    locationHierarchy?: FarmerHeatMapLocationHierarchy,
    session?: ClientSession,
  ): Promise<FarmerHeatMapResponse>;

  getCoordinatorDuplicateQuestionHeatMap(
    coordinatorId: string,
    locationHierarchy?: CoordinatorDuplicateQuestionLocationHierarchy,
    session?: ClientSession,
  ): Promise<CoordinatorDuplicateQuestionHeatMapResponse>;

  getUserById(userId: string, source: string): Promise<any>;
  deleteUser(userId: string, source: string): Promise<boolean>;
  updateUser(
    userId: string,
    source: string,
    data: {
      name?: string;
      userRole?: string;
      farmerProfile?: Partial<FarmerProfile>;
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

  verifyUser(
    userId: string,
    source?: string,
    isVerified?: boolean,
    session?: ClientSession,
  ): Promise<any>;

  // getDailyActiveUsersTrend  ( source: string, userType: string,startDate?: Date, endDate?: Date, session?: ClientSession):Promise<any>

  // getMonthlyActiveUsersTrend ( source: string, userType: string,startDate?: Date, endDate?: Date, session?: ClientSession): Promise<any>

  // getWeeklyActiveUsersTrend ( source: string, userType: string,startDate?: Date, endDate?: Date, session?: ClientSession): Promise<any>

  getRetentionMetrics(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession,
  ): Promise<any>;

  getQuerySummaryByPeriod(
    period: 'daily' | 'weekly' | 'monthly',
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<{label: string; totalQueries: number}>;

  getClosedVsTotalQuestions(source: string, userType?: string, startDate?: Date, endDate?: Date, userId?: string):Promise<any>;

  getNotifiedVsClosed(source?: string, userType?: string, startDate?: Date, endDate?: Date, userId?: string):Promise<any>;

  getClosedInLastTwoHours(source?: string, userType?: string, startDate?: Date, endDate?: Date, userId?: string): Promise<any>;

  getMonthlyChurnRate(source: string, userType: string): Promise<any>;

  getCarryForwardQuestions(source?: string, userType?: string): Promise<any>;

  getActiveUsersTrend(
    source: string,
    userType: string,
    requestType: string,
    startDate?: Date,
    endDate?: Date,
    session?: ClientSession,
  ): Promise<
    {
      _id: string;
      activeUsers: number;
    }[]
  >;

  getRepeatQueryCount(
    source?: string,
    userType?: string,
    startTime?: string,
    endTime?: string,
    session?: ClientSession,
  ): Promise<any>;

  /**
   * Finds unverified users with pagination and search.
   * @param page - Page number (1-indexed)
   * @param limit - Number of users per page
   * @param search - Search query (searches firstName, lastName, email)
   * @param session - MongoDB session for transactions
   * @returns Promise with paginated unverified users and metadata
   */
  findUnverifiedUsers(
    page: number,
    limit: number,
    search: string,
    source?: string,
    session?: ClientSession,
  ): Promise<{
    users: UnverifiedUserEntry[];
    totalUsers: number;
    totalPages: number;
  }>;

  getQuestionsClosedWithinTwoHours(
    page?: number,
    limit?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date,
    isPassed?: string,
    tag?: string,
    userId?: string,
    state?: string,
    district?: string,
  ): Promise<any>

  getQuestionsByNotificationStatus(
  notificationType:string,
  page: number,
  limit: number,
  source: string,
  session?: ClientSession,
  userType?: string,
  search?: string,
  startDate?: Date,
  endDate?: Date,
  userId?: string,
  ): Promise<any>

  getQueriesByPeriod (
    period: string,
    page:number,
    limit: number,
    source: string,
    session?: ClientSession,
    userType?: string,
    search?: string,
  ): Promise<any>


//   getStateQuestionsAndUsersData(
//   state: string,
//   source: string,
//   userType: string,
//   session?: string
// ): Promise<any> 

  getAllStatesQuestionsAndUsersData(
    source: string,
    userType: string,
    allState?:ILocationState[],
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any>



  getUserConversationIds(
    userId: string,
    source: string,
  ): Promise<any>

  getUserProfile(
    userId: string,
    session?: ClientSession,
    startDate?: string,
    endDate?: string,
  ) : Promise<any>
  assignUsers(userId: string, targetIds: string[]): Promise<any>
  unAssignUsers(userId: string, targetIds: string[]): Promise<any>

  getVillageUserCounts(  
    state: string,
    district: string,
    source: string,
    userType: string,
    session?: ClientSession): Promise<any>

  getUserEmailByConversationId(
    conversationId: string,
    source?: string,
  ): Promise<string | null>
    
  getQuestionLifecycle(questionId: string): Promise<any>

    getQuestionFromState(
    state?: string,
    questionType?: QueryCategoryQuestionType,
    page?: number,
    limit?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any>;

  getActiveUsersDetails(
    page: number, 
    limit: number, 
    source: string, 
    userType: string, 
    session?:ClientSession, 
    state?:string, 
    district?:string, 
    search?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any>

    getCoordinatorsDetails(
    page: number, 
    limit: number, 
    source: string, 
    userType: string, 
    session?:ClientSession, 
    state?:string, 
    district?:string, 
    search?: string
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
      userId?: string,
      page?: number,
      limit?: number,
      manualSource?: string,
      effectiveDate?: string,
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
    session?: ClientSession,
    startDate?: Date,
    endDate?: Date,
  ): Promise<PaginatedFeedbackMessages>

  getClosedInLastTwoHoursByLocation(
    source?: string,
    userType?: string,
    state?: string,
    district?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any>

  getActiveUsersDetailsByQuestions(
    page: number,
    limit: number,
    source: string,
    userType: string,
    session?: ClientSession,
    state?: string,
    district?: string,
    search?: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<any>
  
  getQuestionByManualSource(
    manualSource: string, 
    effectiveDate: string,
    userType: string,
    page: number,
    limit: number,
    search: string
  ): Promise<any>
}

export interface ChatbotConversationData {
  conversationId: string;
  farmerQuestions: string[];
  mcpToolCalls: any[][];
}
