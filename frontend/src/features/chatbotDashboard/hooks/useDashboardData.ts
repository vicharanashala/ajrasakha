import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import { DASHBOARD_DATA } from "../mockData";
import {
  formatIndian,
  calcWeeklyDelta,
  calcMonthlyDelta,
} from "../utils/dashboardHelpers";
import type { DailyEntry, AnalyticsEntry } from "../utils/dashboardHelpers";
import type { DashboardFilterValues } from "../DashboardFilters";
import type { DemographicEntry, FeedbackData, UserDemographics } from "../types";
import type { IPlatformInstallEntry } from "../types";
import type { DomainSpikeEntry } from "../components/DomainSpikesModal";
import type { KccAndAgriAppStats, PlatformInstallEntry, ResponseAdherenceTable } from "@/types";
export type DashboardDataType = typeof DASHBOARD_DATA;

interface DashboardApiResponse {
  kpi: {
    dau: number;
    dauLastMonthPct: number;
    dailyQueries: number;
    avgSessionDurationMin: number;
    csatRating: number;
    repeatQueryRatePct: number;
    voiceUsageSharePct: number;
    totalAppInstalls: number;
    inactiveUsersLast3Days: number;
    duplicateQuestionsCount: number;
    lowFeedbackUsersCount: number;
    repeatQueryCount?: number;
    avgQuestionsPerUserDay?: number;
  };
  dau: DailyEntry[];
  weeklySessionDuration: Array<{ week: string; avgSessionDurationMin: number }>;
  monthlySessionDuration: Array<{
    month: string;
    avgSessionDurationMin: number;
  }>;
  dailyQueries: AnalyticsEntry[];
  weeklyQueries: AnalyticsEntry[];
  monthlyQueries: AnalyticsEntry[];
  channelSplit: any[];
  voiceAccuracy: any[];
  geo: any[];
  queryCategories: any[];
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
  kccAwareness: DemographicEntry[];
  agriAppUsage: DemographicEntry[];
  landHolding: DemographicEntry[];
  platformInstalls: IPlatformInstallEntry[];
  domainSpikes?: DomainSpikeEntry[];
  feedbackData: FeedbackData;
  dailyQuestionTrends?: Array<{ day: string; uniqueCount: number; duplicateCount: number }>;
  topFaqs?: Array<{ question: string; count: number }>;
  responseAdherenceTable?: {
    whatsappQuestionAsked: number;
    ajrasakhaQuestionAsked: number;
    whatsappAnsweredWithin120Min: number;
    ajrasakhaAnsweredWithin120Min: number;
    whatsappPassedQuestions: number;
    ajrasakhaPassedQuestions: number;
    whatsappAverageResponseMinutes: number;
    ajrasakhaAverageResponseMinutes: number;
    whatsappInProcessCount: number;
    ajrasakhaInProcessCount: number;
    whatsappAdherencePct: number;
    ajrasakhaAdherencePct: number;
  };
  querySummaries?: {
    daily: { label: string; totalQueries: number };
    weekly: { label: string; totalQueries: number };
    monthly: { label: string; totalQueries: number };
  };
}

// ── Date range label helpers ──────────────────────────────────────────────────

function fmtMonthYear(d: Date): string {
  const year = d.getFullYear();
  const month = d.toLocaleString("en-IN", { month: "short" });
  return `${year} ${month}`;
}

function monthlyRange(entries: DailyEntry[]): string {
  if (entries.length === 0) return "";
  const parse = (s: string) => new Date(s + "T00:00:00");

  return `${fmtMonthYear(parse(entries[0].day))} – ${fmtMonthYear(
    parse(entries[entries.length - 1].day),
  )}`;
}

function fmtMonthLabel(monthStr: string): string {
  const date = new Date(monthStr + "-01");

  return date.toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function fmtFullDate(d: Date): string {
  const year = d.getFullYear();
  const month = d.toLocaleString("en-IN", { month: "short" });
  const day = d.getDate();
  return `${year} ${month} ${day}`;
}

function fmtDayWithWeek(d: Date): string {
  const year = d.getFullYear();
  const month = d.toLocaleString("en-IN", { month: "short" });
  const day = d.getDate();
  const wk = Math.ceil(day / 7);
  return `${year} ${month} ${day} · Wk ${wk}`;
}

function dailyRange(entries: DailyEntry[]): string {
  if (entries.length === 0) return "";
  const parse = (s: string) => new Date(s + "T00:00:00");

  return `${fmtFullDate(parse(entries[0].day))} – ${fmtFullDate(
    parse(entries[entries.length - 1].day),
  )}`;
}

function parseWeek(isoWeek: string) {
  const [yearStr, weekStr] = isoWeek.split("-W");
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);

  const month = Math.ceil(week / 4);
  let weekOfMonth = week % 4;
  if (weekOfMonth === 0) weekOfMonth = 4;

  return { year, month, weekOfMonth };
}

function fmtWeekLabel(isoWeek: string): string {
  const { year, month, weekOfMonth } = parseWeek(isoWeek);

  const monthName = new Date(year, month - 1).toLocaleString("en-IN", {
    month: "short",
  });

  return `${year} ${monthName} Wk ${weekOfMonth}`;
}

function weeklyRange(entries: Array<{ week: string }>): string {
  if (entries.length === 0) return "";

  return `${fmtWeekLabel(entries[0].week)} – ${fmtWeekLabel(
    entries[entries.length - 1].week,
  )}`;
}

// ── Transform raw API response into dashboard shape ─────────────────────────

function transformApiResponse(
  result: DashboardApiResponse,
  source: "vicharanashala" | "annam" | "whatsapp" = "vicharanashala",
  userType: "all" | "external" | "internal" = "all",
): DashboardDataType & {
  inactiveUsersLast3Days: number;
  duplicateQuestionsCount: number;
  lowFeedbackUsersCount: number;
} {
  const updatedData = { ...DASHBOARD_DATA } as DashboardDataType & {
    inactiveUsersLast3Days: number;
    duplicateQuestionsCount: number;
    lowFeedbackUsersCount: number;
  };
  // Use the real month-over-month % from the backend
  const pct = result.kpi.dauLastMonthPct;
  const delta =
    pct > 0
      ? { text: `+${pct}% vs last month`, dir: "up" as const }
      : pct < 0
        ? { text: `${pct}% vs last month`, dir: "down" as const }
        : { text: "Stable vs last month", dir: "neutral" as const };

  // Build sparkline from all DAU data points (up to 30 days)
  const sparkPoints =
    result.dau.length > 0
      ? result.dau.map((d) => d.count)
      : DASHBOARD_DATA.kpiRow1[0].sparkPoints; // fallback to mock sparkline
  // Session duration: compare current week vs last week
  const sessionWeekly = result.weeklySessionDuration ?? [];
  const thisWeek = sessionWeekly.at(-1)?.avgSessionDurationMin ?? 0;
  const lastWeek = sessionWeekly.at(-2)?.avgSessionDurationMin ?? 0;
  const sessionDelta: { text: string; dir: "up" | "down" | "neutral" } =
    lastWeek === 0 || sessionWeekly.length < 2
      ? { text: "Not enough data", dir: "neutral" }
      : (() => {
          const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
          if (pct > 0)
            return { text: `+${pct}% vs last week`, dir: "up" as const };
          if (pct < 0)
            return { text: `${pct}% vs last week`, dir: "down" as const };
          return { text: "Stable vs last week", dir: "neutral" as const };
        })();

  const sessionMonthly = result.monthlySessionDuration ?? [];

  const thisMonth = sessionMonthly.at(-1)?.avgSessionDurationMin ?? 0;

  const lastMonth = sessionMonthly.at(-2)?.avgSessionDurationMin ?? 0;

  const sessionMonthlyDelta: {
    text: string;
    dir: "up" | "down" | "neutral";
  } =
    lastMonth === 0 || sessionMonthly.length < 2
      ? {
          text: "Not enough data",
          dir: "neutral",
        }
      : (() => {
          const pct = Math.round(((thisMonth - lastMonth) / lastMonth) * 100);

          if (pct > 0) {
            return {
              text: `+${pct}% vs last month`,
              dir: "up" as const,
            };
          }

          if (pct < 0) {
            return {
              text: `${pct}% vs last month`,
              dir: "down" as const,
            };
          }

          return {
            text: "Stable vs last month",
            dir: "neutral" as const,
          };
        })();
  void sessionMonthlyDelta;

  const sessionSparkPoints =
    sessionWeekly.length > 0
      ? sessionWeekly.map((w) => w.avgSessionDurationMin)
      : (DASHBOARD_DATA.kpiRow1.find((c) => c.id === "session")?.sparkPoints ??
        []);

  const monthlySessionSparkPoints =
    sessionMonthly.length > 0
      ? sessionMonthly.map((m) => m.avgSessionDurationMin)
      : [];

  const monthlySessionLabels = sessionMonthly.map((m) =>
    fmtMonthLabel(m.month),
  );

  // Daily queries: true week-over-week delta (last 7 days vs prior 7 days)
  const queryTrend = result.dailyQueries ?? [];
  const queryDelta = calcWeeklyDelta(queryTrend.map(q => ({ day: q.period, count: q.queryCount })));
  const monthQueryTrend = result.monthlyQueries ?? [];
  const queryMonthlyDelta = calcMonthlyDelta(monthQueryTrend.map(q => ({ month: q.period, count: q.queryCount })));
  // Sparkline: use all-time weekly totals as data points
  const weeklyQueryData = result.weeklyQueries ?? [];
  const querySparkPoints =
    weeklyQueryData.length > 0
      ? weeklyQueryData.map((w) => w.queryCount)
      : (DASHBOARD_DATA.kpiRow1.find((c) => c.id === "queries")?.sparkPoints ??
        []);

  const monthlyQueryData = result.monthlyQueries ?? [];

  const monthlyQuerySparkPoints =
    monthlyQueryData.length > 0 ? monthlyQueryData.map((m) => m.queryCount) : [];

  const monthlyQueryLabels = monthlyQueryData.map((m) =>
    fmtMonthLabel(m.period),
  );

  const dauRange = monthlyRange(result.dau);
  const queryRange = dailyRange(queryTrend.map(q => ({ day: q.period, count: q.queryCount })));
  const sessionRange = weeklyRange(sessionWeekly);

  // parse handles both YYYY-MM (monthly DAU) and YYYY-MM-DD (daily queries)
  const parseDay = (s: string) =>
    new Date((s.length === 7 ? s + "-01" : s) + "T00:00:00");
  const dauLabels = result.dau.map((d) => fmtMonthYear(parseDay(d.day)));
  const queryLabels = queryTrend.map((d) => fmtDayWithWeek(parseDay(d.period)));
  const sessionLabels = sessionWeekly.map((w) => fmtWeekLabel(w.week));
  void queryLabels;

  updatedData.ageGroups = result.ageGroups ?? [];
  updatedData.genderSplit = result.genderSplit ?? [];
  updatedData.kccAwareness = result.kccAwareness ?? [];
  updatedData.agriAppUsage = result.agriAppUsage ?? [];
  updatedData.farmingExperience = result.farmingExperience ?? [];
  updatedData.landHolding = result.landHolding?.length
    ? result.landHolding
    : DASHBOARD_DATA.landHolding;
  updatedData.platformInstalls = result.platformInstalls ?? [];
  // Use real spikes from API; only fall back to mock if field is absent (old backend)
  updatedData.domainSpikes = Array.isArray(result.domainSpikes)
    ? result.domainSpikes
    : DASHBOARD_DATA.domainSpikes;

  updatedData.kpiRow2 = DASHBOARD_DATA.kpiRow2.map((card) => {
    if (card.id === "totalInstalls") {
      return {
        ...card,
        value: `${result.kpi.totalAppInstalls.toString()}${result?.kpi?.dau ? ` / ${Number(result.kpi.dau).toLocaleString()}` : ""}`,
      };
    }
    return card;
  });

  updatedData.inactiveUsersLast3Days = result.kpi.inactiveUsersLast3Days ?? 0;
  updatedData.duplicateQuestionsCount = result.kpi.duplicateQuestionsCount ?? 0;
  updatedData.lowFeedbackUsersCount = result.kpi.lowFeedbackUsersCount ?? 0;

  updatedData.kpiRow1 = DASHBOARD_DATA.kpiRow1.map((card) => {
    if (card.id === "dau") {
      return {
        ...card,
        value: result.kpi.totalAppInstalls.toString(), // raw number, no formatting
        delta: delta.text,
        deltaDir: delta.dir,
        sparkPoints,
        sparkLabels: dauLabels,
        dateRange: dauRange,
        userType,
      };
    }
    if (card.id === "queries") {
      return {
        ...card,
        value: formatIndian(result.kpi.dailyQueries),
        delta: queryDelta.text,
        deltaDir: queryDelta.dir,
        monthlyDelta: queryMonthlyDelta.text,
        monthlyDeltaDir: queryMonthlyDelta.dir,
        sparkPoints: querySparkPoints,
        sparkLabels: weeklyQueryData.map((w) => fmtWeekLabel(w.period)),
        dailySparkPoints: queryTrend.map((d) => d.queryCount),
        dailySparkLabels: queryTrend.map((d) => {
          const date = parseDay(d.period);
          return date.toLocaleString("en-IN", {
            month: "short",
            day: "numeric",
          });
        }),
        monthlySparkPoints: monthlyQuerySparkPoints,
        monthlySparkLabels: monthlyQueryLabels,
        dateRange: queryRange,
        dailyAnalytics: queryTrend,
        weeklyAnalytics: weeklyQueryData,
        monthlyAnalytics: monthlyQueryData,
        source,
        userType,
        querySummaries: result.querySummaries,
      };
    }
    if (card.id === "session") {
      return {
        ...card,
        value: `${result.kpi.avgSessionDurationMin.toFixed(1)} min`,
        delta: sessionDelta.text,
        deltaDir: sessionDelta.dir,
        sparkPoints: sessionSparkPoints,
        sparkLabels: sessionLabels,
        dateRange: sessionRange,
        monthlySparkPoints: monthlySessionSparkPoints,
        monthlySparkLabels: monthlySessionLabels,
      };
    }
    return card;
  });

  updatedData.queryCategories = result.queryCategories ?? [];
  updatedData.feedbackData = result.feedbackData ?? {
    positiveFeedbacks: [],
    negativeFeedbacks: [],
    stats: {
      _id: null,
      positiveCount: 0,
      negativeCount: 0,
      averageRating: 0,
      totalFeedbacks: 0
    }
  };

  (updatedData as any).dailyQuestionTrends = result.dailyQuestionTrends ?? [];
  (updatedData as any).topFaqs = result.topFaqs ?? [];
  (updatedData as any).topQuestionsFromCollection = (result as any).topQuestionsFromCollection ?? [];
  (updatedData as any).repeatQueryCount = result.kpi.repeatQueryCount ?? 0;
  (updatedData as any).repeatQueryRatePct = result.kpi.repeatQueryRatePct ?? 0;
  (updatedData as any).avgQuestionsPerUserDay = result.kpi.avgQuestionsPerUserDay ?? 0;
  (updatedData as any).responseAdherenceTable = result.responseAdherenceTable ?? {
    whatsappQuestionAsked: 0,
    ajrasakhaQuestionAsked: 0,
    whatsappAnsweredWithin120Min: 0,
    ajrasakhaAnsweredWithin120Min: 0,
    whatsappPassedQuestions: 0,
    ajrasakhaPassedQuestions: 0,
    whatsappAverageResponseMinutes: 0,
    ajrasakhaAverageResponseMinutes: 0,
    whatsappInProcessCount: 0,
    ajrasakhaInProcessCount: 0,
    whatsappAdherencePct: 0,
    ajrasakhaAdherencePct: 0,
  };

  return updatedData;
}

// ─────────────────────────────────────────────────────────────────────────────

// Custom hook to fetch and transform dashboard data based on filters
export function useDashboardData(
  filters?: DashboardFilterValues,
  source: "vicharanashala" | "annam" | "whatsapp"= "vicharanashala",
  enabled?: boolean
) {
  const startISO = filters?.startTime?.toISOString();
  const endISO = filters?.endTime?.toISOString();
  const userType = filters?.userType ?? "all";

  const { data, isLoading, isFetching, error } = useQuery<DashboardDataType, Error>({
    queryKey: [
      "dashboard-data",
      source,
      userType,
    ],
    enabled,
    // Keep previous data while fetching new data (for filter changes)
    placeholderData: (prev) => prev,
    staleTime: 5 * 60 * 1000, // Data is fresh for 5 minutes
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();

      // Build query params from filters
      const params = new URLSearchParams();
      if (filters?.village && filters.village !== "all")
        params.set("village", filters.village);
      if (filters?.crop && filters.crop !== "all")
        params.set("crop", filters.crop);
      if (filters?.season && filters.season !== "all")
        params.set("season", filters.season);
      if (startISO) params.set("startTime", startISO);
      if (endISO) params.set("endTime", endISO);
      params.set("source", source);
      if (userType !== "all") params.set("userType", userType);
      const queryString = params.toString();

      const result = await apiFetch<DashboardApiResponse>(
        `${API_BASE_URL}/analytics${queryString ? `?${queryString}` : ""}`,
      );

      if (result) {
        return transformApiResponse(result, source, userType);
      }

      // Fallback to mock data if API returns nothing
      return DASHBOARD_DATA;
    },
  });

  // Use memoized fallback so consumers always get a stable reference
  const safeData = useMemo(() => data ?? DASHBOARD_DATA, [data]);

  return { data: safeData, isLoading, isFetching, error: error ?? null };
}


export const useTopFaqs = (
  source: string = 'vicharanashala',
  userType: string = 'all',
  startTime?: Date,
  endTime?: Date,
  enabled?: boolean,
) => {
  const params = new URLSearchParams();
  params.append("source", source);
  params.append("userType", userType);
  if (startTime) params.append("startTime", startTime.toISOString());
  if (endTime) params.append("endTime", endTime.toISOString());
  return useQuery({
    queryKey: [
      "top-faqs",
      source,
      userType,
      startTime,
      endTime
    ],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<DashboardApiResponse>(
        `${API_BASE_URL}/analytics/top-faqs?${params.toString()}`
      );
      return result;
    },
    enabled
  });
}

export const useDailyQuestionTrends = (
  source: string = 'vicharanashala',
  userType: string = 'all',
  startDate?: Date,
  endDate?: Date,
  enabled?: boolean,
) => {
  const params = new URLSearchParams();
  params.append("source", source);
  params.append("userType", userType);
  if (startDate) params.append("startDate", startDate.toISOString());
  if (endDate) params.append("endDate", endDate.toISOString());
  return useQuery({
    queryKey: [
      "daily-question-trends",
      source,
      userType,
      startDate,
      endDate
    ],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<DashboardApiResponse>(
        `${API_BASE_URL}/analytics/daily-question-trends?${params.toString()}`
      );
      return result;
    },
    enabled
  });
}

interface UsermetricsResponse {
  userDemographics: UserDemographics;
  platformInstalls: PlatformInstallEntry[];
  kccAndAgriAppUsage: KccAndAgriAppStats;
  feedbackData: FeedbackData;
}

export const useUserMertices = (
  source: string = 'vicharanashala',
  userType: string = 'all',
  shouldLoadUserDemographics: boolean = false,
) => {
  const params = new URLSearchParams();
  params.append("source", source);
  params.append("userType", userType);
  return useQuery({
    queryKey: [
      "user-metrices",
      source,
      userType,
    ],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch(
        `${API_BASE_URL}/analytics/users-metrices?${params.toString()}`
      );
      return result as UsermetricsResponse;
    }, 
    enabled: shouldLoadUserDemographics,
  });
}

export const useResponseAdherenceTable = (source?: string, userType?: string, startTime?: Date, endTime?: Date, shouldLoad?: boolean) => {
  const params = new URLSearchParams();
  params.append("source", source || 'vicharanashala');
  params.append("userType", userType || 'all');
  if (startTime) params.append("startDate", startTime.toISOString());
  if (endTime) params.append("endDate", endTime.toISOString());
  return useQuery({
    queryKey: [
      "response-adherence-table",
      source,
      userType,
      startTime,
      endTime
    ],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<ResponseAdherenceTable>(
        `${API_BASE_URL}/analytics/response-adherence-table-data?${params.toString()}`
      );
      return result;
    },
    enabled: shouldLoad
  });
}
