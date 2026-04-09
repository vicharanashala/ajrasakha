import { useState, useEffect } from 'react';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface UserDetail {
  userId: string;
  name: string;
  email: string;
  totalQuestions: number;
}

export function useUserDetails(startDate?: Date, endDate?: Date) {
  const [data, setData] = useState<UserDetail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      setIsLoading(true);
      setError(null);
      try {
        const API_BASE_URL = env.apiBaseUrl();
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate.toISOString());
        if (endDate) params.set('endDate', endDate.toISOString());
        const qs = params.toString();

        const result = await apiFetch<UserDetail[]>(
          `${API_BASE_URL}/analytics/user-details${qs ? `?${qs}` : ''}`,
        );

        if (isMounted && result) {
          setData(result);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [startDate?.toISOString(), endDate?.toISOString()]);

  return { data, isLoading, error };
}
