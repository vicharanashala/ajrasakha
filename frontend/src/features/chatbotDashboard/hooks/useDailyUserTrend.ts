import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

interface DailyUserTrendEntry {
  day: string;
  count: number;
}

export function useDailyUserTrend(days = 30) {
  const { data: rawData, isLoading, error } = useQuery<DailyUserTrendEntry[], Error>({
    queryKey: ['daily-user-trend', days],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<DailyUserTrendEntry[]>(
        `${API_BASE_URL}/analytics/user-trend?days=${days}`,
      );
      return result ?? [];
    },
  });

  // Transform sparse API response into a filled array of counts (one per day)
  const data = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    // Build a lookup from the sparse API response (only days with activity)
    const countByDay: Record<string, number> = {};
    for (const entry of rawData) {
      countByDay[entry.day] = entry.count;
    }

    // Generate the full date range (last `days` days) in YYYY-MM-DD IST,
    // matching the timezone used by the backend aggregation (+05:30)
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const filled: number[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const istDate = new Date(d.getTime() + IST_OFFSET_MS);
      const key = istDate.toISOString().slice(0, 10); // YYYY-MM-DD in IST
      filled.push(countByDay[key] ?? 0);
    }
    return filled;
  }, [rawData, days]);

  return { data, isLoading, error: error ?? null };
}
