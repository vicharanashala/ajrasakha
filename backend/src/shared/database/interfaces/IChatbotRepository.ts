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
  totalAppInstalls: number; // It will the count the user whose profile is completed or not.
  inactiveUsersLast3Days: number; // users with zero messages in the last 3 days
  duplicateQuestionsCount: number; // questions with a similarityScore field
  lowFeedbackUsersCount: number; // users who have never given any feedback (no feedback object in messages)
}

export interface DuplicateQuestionEntry {
  questionId: string;
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

export interface FarmerProfile {
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
  platformHistory?: { os: string; timestamp: string }[];
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface UserDetailEntry {
  userId: string;
  name: string;
  email: string;
  totalQuestions: number;
  farmerProfile?: FarmerProfile;
}

export interface PaginatedUserDetails {
  users: UserDetailEntry[];
  totalUsers: number;
  totalPages: number;
  activeUsers: number;
  inactiveUsers: number;
  totalQuestions: number;
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
  date: string;       // 'YYYY-MM-DD'
  count: number;      // query count on that date
  baseline: number;   // rolling 30-day average (excluding the spike day)
  spikePct: number;   // % above baseline, rounded
  location?: string;  // most common "District, State" for that domain+date
}

// ─── Single consolidated interface ───────────────────────────────────────────

export interface IChatbotRepository {
  /** Aggregated KPI summary for the current day. */
  getKpiSummary(source?: string, session?: ClientSession, userType?: string): Promise<KpiSummary>;

  /** Daily unique active users over the last `days` days. */
  getDailyActiveUsers(
    days: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<DailyActiveUsersEntry[]>;

  /** Percentage breakdown of sessions by channel (voice / text / kcc_agent / ivrs). */
  getChannelSplit(source?: string, session?: ClientSession): Promise<ChannelSplitEntry[]>;

  /** Average voice recognition accuracy grouped by language. */
  getVoiceAccuracyByLanguage(
    source?: string,
    session?: ClientSession,
  ): Promise<VoiceAccuracyEntry[]>;

  /** Session counts grouped by state abbreviation, sorted descending. */
  getGeoDistribution(source?: string, session?: ClientSession): Promise<GeoStateEntry[]>;

  /** Percentage breakdown of sessions by query category, sorted descending. */
  getQueryCategories(source?: string, session?: ClientSession, userType?: string): Promise<QueryCategoryEntry[]>;

  getTopCrops(session?: ClientSession): Promise<{ totalQuestions: number, topCrops: {name: string, count: number}[] }>;

  /** Weekly avg session duration (updatedAt - createdAt) over the last `weeks` ISO weeks, sorted ascending. */
  getWeeklyAvgSessionDuration(
    weeks?: number,
    source?: string,
    session?: ClientSession,
  ): Promise<WeeklySessionDurationEntry[]>;

  /** Daily user-message counts from the messages collection over the last `days` days, sorted ascending. */
  getDailyQueryCounts(
    days?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<DailyQueryCountEntry[]>;

  /** Count of user messages created today from the messages collection. */
  getTodayQueryCount(source?: string, session?: ClientSession, userType?: string): Promise<number>;

  /** Weekly query totals (all-time) from the messages collection, sorted ascending by ISO week. */
  getWeeklyQueryCounts(
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<WeeklyQueryCountEntry[]>;

  /** Daily user activity trend (users active per day) over the last `days` days, sorted ascending. */
  getDailyUserTrend(
    days?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<DailyActiveUsersEntry[]>;
  findMatchingMessages(data: {question: string; details: any; createdAt: Date; questionId: string; messageId?: string|undefined});
  findFromSecondDb(data: {question: string; details: any; createdAt: Date; questionId: string; messageId?: string|undefined});

  /** Inactivity-gap based avg session duration in minutes (KPI number). Requires MongoDB 5.0+. */
  getAvgSessionDurationV2(source?: string, session?: ClientSession, userType?: string): Promise<number>;

  /** Inactivity-gap based weekly avg session duration for sparkline/delta. Requires MongoDB 5.0+. */
  getWeeklyAvgSessionDurationV2(
    weeks?: number,
    source?: string,
    session?: ClientSession,
    userType?: string,
  ): Promise<WeeklySessionDurationEntry[]>;

  /** Get all users with their question counts, optionally filtered by date range, with server-side pagination. */
  getUserDetails(
    startDate?: Date,
    endDate?: Date,
    page?: number,
    limit?: number,
    search?: string,
    source?: string,
    crop?: string,
    village?: string,
    profileCompleted?: string,
    inactiveOnly?: boolean,
    session?: ClientSession,
    userType?: string,
    sortBy?: string,
    sortOrder?: string,
    lowFeedbackOnly?: boolean,
  ): Promise<PaginatedUserDetails>;

  /** Aggregate conversations from the messages collection for Excel export. */
  generateChatbotExcelReport(
    startDate: Date,
    endDate: Date,
    source?: string,
    session?: ClientSession,
  ): Promise<ChatbotConversationData[]>;

  /** Aggregate age group, gender split, and farming experience distributions from farmerProfile. */
  getUserDemographics(source?: string, session?: ClientSession, userType?: string): Promise<UserDemographics>;

  /** Aggregate KCC policy awareness and agri app usage splits from farmerProfile. */
  getKccAndAgriAppStats(source?: string, session?: ClientSession, userType?: string): Promise<KccAndAgriAppStats>;

  getIdsCreated(startDate:Date,endDate:Date, session?: ClientSession)
  getInstalls(startDate:Date,endDate:Date, session?: ClientSession)
  getActiveUsers(startDate:Date,endDate:Date, session?: ClientSession)

  // get platform wise installs
  getPlatformInstalls(source: string, session?: ClientSession): Promise<PlatformInstallEntry[]>;

  /** Duplicate questions (questions with a similarityScore) enriched with farmer details. */
  getDuplicateQuestions(source?: string, session?: ClientSession): Promise<DuplicateQuestionEntry[]>;

  /** Domain query spikes: days where a domain's question count is ≥2× its 30-day rolling average. */
  getDomainSpikes(days?: number, session?: ClientSession): Promise<DomainSpikeEntry[]>;
}

export interface ChatbotConversationData {
  conversationId: string;
  farmerQuestions: string[];
  mcpToolCalls: any[][];
}
