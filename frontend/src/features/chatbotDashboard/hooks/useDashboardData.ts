import { useState, useEffect } from 'react';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { DASHBOARD_DATA } from '../mockData';
import { formatIndian, calcDelta } from '../utils/dashboardHelpers';
import type { DailyEntry } from '../utils/dashboardHelpers';
import type { DashboardFilterValues } from '../DashboardFilters';

export type DashboardDataType = typeof DASHBOARD_DATA;

interface DashboardApiResponse {
  kpi: {
    dau: number;
    dailyQueries: number;
    avgSessionDurationMin: number;
    csatRating: number;
    repeatQueryRatePct: number;
    voiceUsageSharePct: number;
  };
  dau: DailyEntry[];
  channelSplit: any[];
  voiceAccuracy: any[];
  geo: any[];
  queryCategories: any[];
}

export function useDashboardData(filters?: DashboardFilterValues) {
  const [data, setData] = useState<DashboardDataType>(DASHBOARD_DATA);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      try {
        setIsLoading(true);

        const API_BASE_URL = env.apiBaseUrl();

        // Build query params from filters
        const params = new URLSearchParams();
        if (filters?.village && filters.village !== 'all') params.set('village', filters.village);
        if (filters?.crop && filters.crop !== 'all') params.set('crop', filters.crop);
        if (filters?.season && filters.season !== 'all') params.set('season', filters.season);
        if (filters?.startTime) params.set('startTime', filters.startTime.toISOString());
        if (filters?.endTime) params.set('endTime', filters.endTime.toISOString());
        const queryString = params.toString();

        const result = await apiFetch<DashboardApiResponse>(
          `${API_BASE_URL}/analytics/dashboard${queryString ? `?${queryString}` : ''}`
        );

        if (isMounted && result) {
          const updatedData = { ...DASHBOARD_DATA };

          // Calculate delta from DAU trend
          const delta = calcDelta(result.dau);

          // Build sparkline from last 13 DAU data points
          const sparkPoints = result.dau.length > 0
            ? result.dau.slice(-13).map(d => d.count)
            : DASHBOARD_DATA.kpiRow1[0].sparkPoints; // fallback to mock sparkline

          updatedData.kpiRow1 = DASHBOARD_DATA.kpiRow1.map(card => {
            if (card.id === 'dau') {
              return {
                ...card,
                value: formatIndian(result.kpi.dau),
                delta: delta.text,
                deltaDir: delta.dir,
                sparkPoints,
              };
            }
            return card;
          });

          setData(updatedData);
          setError(null);
        } else if (isMounted) {
          setData(DASHBOARD_DATA);
        }
      } catch (err) {
        console.error('Dashboard API error, using mock data:', err);
        if (isMounted) {
          setData(DASHBOARD_DATA);
          setError(err instanceof Error ? err : new Error('An unknown error occurred'));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [filters?.village, filters?.crop, filters?.season, filters?.startTime, filters?.endTime]);

  return { data, isLoading, error };
}
