import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { DASHBOARD_DATA } from '../mockData';
import { formatIndian, calcWeeklyDelta } from '../utils/dashboardHelpers';
import type { DailyEntry } from '../utils/dashboardHelpers';
import type { DashboardFilterValues } from '../DashboardFilters';
import type { DemographicEntry } from '../types';

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
  };
  dau: DailyEntry[];
  weeklySessionDuration: Array<{ week: string; avgSessionDurationMin: number }>;
  dailyQueries: DailyEntry[];
  weeklyQueries: Array<{ week: string; count: number }>;
  channelSplit: any[];
  voiceAccuracy: any[];
  geo: any[];
  queryCategories: any[];
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
  kccAwareness: DemographicEntry[];
  agriAppUsage: DemographicEntry[];
  duplicateQuestionCount: number;
}

// ── Date range label helpers ──────────────────────────────────────────────────

function fmtMonthYear(d: Date): string {
  const year = d.getFullYear();
  const month = d.toLocaleString('en-IN', { month: 'short' });
  return `${year} ${month}`;
}

function monthlyRange(entries: DailyEntry[]): string {
  if (entries.length === 0) return '';
  const parse = (s: string) => new Date(s + 'T00:00:00');

  return `${fmtMonthYear(parse(entries[0].day))} – ${fmtMonthYear(
    parse(entries[entries.length - 1].day)
  )}`;
}

function fmtFullDate(d: Date): string {
  const year = d.getFullYear();
  const month = d.toLocaleString('en-IN', { month: 'short' });
  const day = d.getDate();
  return `${year} ${month} ${day}`;
}

function fmtDayWithWeek(d: Date): string {
  const year = d.getFullYear();
  const month = d.toLocaleString('en-IN', { month: 'short' });
  const day = d.getDate();
  const wk = Math.ceil(day / 7);
  return `${year} ${month} ${day} · Wk ${wk}`;
}

function dailyRange(entries: DailyEntry[]): string {
  if (entries.length === 0) return '';
  const parse = (s: string) => new Date(s + 'T00:00:00');

  return `${fmtFullDate(parse(entries[0].day))} – ${fmtFullDate(
    parse(entries[entries.length - 1].day)
  )}`;
}


function parseWeek(isoWeek: string) {
  const [yearStr, weekStr] = isoWeek.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(weekStr);

  const month = Math.ceil(week / 4);
  let weekOfMonth = week % 4;
  if (weekOfMonth === 0) weekOfMonth = 4;

  return { year, month, weekOfMonth };
}

function fmtWeekLabel(isoWeek: string): string {
  const { year, month, weekOfMonth } = parseWeek(isoWeek);

  const monthName = new Date(year, month - 1).toLocaleString('en-IN', {
    month: 'short',
  });

  return `${year} ${monthName} Wk ${weekOfMonth}`;
}

function weeklyRange(entries: Array<{ week: string }>): string {
  if (entries.length === 0) return '';

  return `${fmtWeekLabel(entries[0].week)} – ${fmtWeekLabel(
    entries[entries.length - 1].week
  )}`;
}

// ── Transform raw API response into dashboard shape ─────────────────────────

function transformApiResponse(
  result: DashboardApiResponse
): DashboardDataType & {
  inactiveUsersLast3Days: number;
  duplicateQuestionCount: number;
} {
  const updatedData = {
    ...DASHBOARD_DATA,
  } as DashboardDataType & {
    inactiveUsersLast3Days: number;
    duplicateQuestionCount: number;
  };

  // Use the real month-over-month % from the backend
  const pct = result.kpi.dauLastMonthPct;
  const delta = pct > 0
    ? { text: `+${pct}% vs last month`, dir: 'up' as const }
    : pct < 0
    ? { text: `${pct}% vs last month`, dir: 'down' as const }
    : { text: 'Stable vs last month', dir: 'neutral' as const };

  // Build sparkline from all DAU data points (up to 30 days)
  const sparkPoints = result.dau.length > 0
    ? result.dau.map(d => d.count)
    : DASHBOARD_DATA.kpiRow1[0].sparkPoints; // fallback to mock sparkline
  // Session duration: compare current week vs last week
  const sessionWeekly = result.weeklySessionDuration ?? [];
  const thisWeek = sessionWeekly.at(-1)?.avgSessionDurationMin ?? 0;
  const lastWeek = sessionWeekly.at(-2)?.avgSessionDurationMin ?? 0;
  const sessionDelta: { text: string; dir: 'up' | 'down' | 'neutral' } =
    lastWeek === 0 || sessionWeekly.length < 2
      ? { text: 'Not enough data', dir: 'neutral' }
      : (() => {
        const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
        if (pct > 0) return { text: `+${pct}% vs last week`, dir: 'up' as const };
        if (pct < 0) return { text: `${pct}% vs last week`, dir: 'down' as const };
        return { text: 'Stable vs last week', dir: 'neutral' as const };
      })();
  const sessionSparkPoints = sessionWeekly.length > 0
    ? sessionWeekly.map(w => w.avgSessionDurationMin)
    : DASHBOARD_DATA.kpiRow1.find(c => c.id === 'session')?.sparkPoints ?? [];

  // Daily queries: true week-over-week delta (last 7 days vs prior 7 days)
  const queryTrend = result.dailyQueries ?? [];
  const queryDelta = calcWeeklyDelta(queryTrend);
  // Sparkline: use all-time weekly totals as data points
  const weeklyQueryData = result.weeklyQueries ?? [];
  const querySparkPoints = weeklyQueryData.length > 0
    ? weeklyQueryData.map(w => w.count)
    : DASHBOARD_DATA.kpiRow1.find(c => c.id === 'queries')?.sparkPoints ?? [];

  const dauRange = monthlyRange(result.dau);
  const queryRange = dailyRange(queryTrend);
  const sessionRange = weeklyRange(sessionWeekly);

  // parse handles both YYYY-MM (monthly DAU) and YYYY-MM-DD (daily queries)
  const parseDay = (s: string) => new Date((s.length === 7 ? s + '-01' : s) + 'T00:00:00');
  const dauLabels = result.dau.map(d => fmtMonthYear(parseDay(d.day)));
  const queryLabels = queryTrend.map(d => fmtDayWithWeek(parseDay(d.day)));
  const sessionLabels = sessionWeekly.map(w => fmtWeekLabel(w.week));

  updatedData.ageGroups = result.ageGroups ?? [];
  updatedData.genderSplit = result.genderSplit ?? [];
  updatedData.kccAwareness = result.kccAwareness ?? [];
  updatedData.agriAppUsage = result.agriAppUsage ?? [];
  updatedData.farmingExperience = result.farmingExperience ?? [];

  updatedData.kpiRow2 = DASHBOARD_DATA.kpiRow2.map(card => {
    if (card.id === 'totalInstalls') {
      return {
        ...card,
        value: result.kpi.totalAppInstalls.toString(),
      };
    }
    return card;
  });

  updatedData.inactiveUsersLast3Days = result.kpi.inactiveUsersLast3Days ?? 0;
  updatedData.duplicateQuestionCount = result.duplicateQuestionCount ?? 0;

  updatedData.kpiRow1 = DASHBOARD_DATA.kpiRow1.map(card => {
    if (card.id === 'dau') {
      return {
        ...card,
        value: result.kpi.dau.toString(), // raw number, no formatting
        delta: delta.text,
        deltaDir: delta.dir,
        sparkPoints,
        sparkLabels: dauLabels,
        dateRange: dauRange,
      };
    }
    if (card.id === 'queries') {
      return {
        ...card,
        value: formatIndian(result.kpi.dailyQueries),
        delta: queryDelta.text,
        deltaDir: queryDelta.dir,
        sparkPoints: querySparkPoints,
        sparkLabels: queryLabels,
        dateRange: queryRange,
      };
    }
    if (card.id === 'session') {
      return {
        ...card,
        value: `${result.kpi.avgSessionDurationMin.toFixed(1)} min`,
        delta: sessionDelta.text,
        deltaDir: sessionDelta.dir,
        sparkPoints: sessionSparkPoints,
        sparkLabels: sessionLabels,
        dateRange: sessionRange,
      };
    }
    return card;
  });

  return updatedData;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useDashboardData(filters?: DashboardFilterValues, source: 'vicharanashala' | 'annam' = 'vicharanashala') {
  const startISO = filters?.startTime?.toISOString();
  const endISO = filters?.endTime?.toISOString();

  const { data, isLoading, error } = useQuery<DashboardDataType, Error>({
    queryKey: [
      'dashboard-data',
      filters?.village ?? 'all',
      filters?.crop ?? 'all',
      filters?.season ?? 'all',
      startISO,
      endISO,
      source,
    ],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();

      // Build query params from filters
      const params = new URLSearchParams();
      if (filters?.village && filters.village !== 'all') params.set('village', filters.village);
      if (filters?.crop && filters.crop !== 'all') params.set('crop', filters.crop);
      if (filters?.season && filters.season !== 'all') params.set('season', filters.season);
      if (startISO) params.set('startTime', startISO);
      if (endISO) params.set('endTime', endISO);
      params.set('source', source);
      const queryString = params.toString();

      const result = await apiFetch<DashboardApiResponse>(
        `${API_BASE_URL}/analytics${queryString ? `?${queryString}` : ''}`
      );

      if (result) {
        return transformApiResponse(result);
      }

      // Fallback to mock data if API returns nothing
      return DASHBOARD_DATA;
    },
  });

  // Use memoized fallback so consumers always get a stable reference
  const safeData = useMemo(() => data ?? DASHBOARD_DATA, [data]);

  return { data: safeData, isLoading, error: error ?? null };
}
