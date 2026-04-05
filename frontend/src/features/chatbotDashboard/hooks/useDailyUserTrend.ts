import { useState, useEffect } from 'react';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

interface DailyUserTrendEntry {
  day: string;
  count: number;
}

export function useDailyUserTrend(days = 30) {
  const [data, setData] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const API_BASE_URL = env.apiBaseUrl();
        const result = await apiFetch<DailyUserTrendEntry[]>(
          `${API_BASE_URL}/analytics/user-trend?days=${days}`,
        );
        if (result) {
          // Build a lookup from the sparse API response (only days with activity)
          const countByDay: Record<string, number> = {};
          for (const entry of result) {
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
          setData(filled);
        }
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [days]);

  return { data, isLoading, error };
}
