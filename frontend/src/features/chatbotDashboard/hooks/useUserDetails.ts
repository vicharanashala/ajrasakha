import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface UserDetail {
  userId: string;
  name: string;
  email: string;
  totalQuestions: number;
}

export function useUserDetails(startDate?: Date, endDate?: Date) {
  const startISO = startDate?.toISOString();
  const endISO = endDate?.toISOString();

  const { data, isLoading, error } = useQuery<UserDetail[], Error>({
    queryKey: ['user-details', startISO, endISO],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();
      if (startISO) params.set('startDate', startISO);
      if (endISO) params.set('endDate', endISO);
      const qs = params.toString();

      const result = await apiFetch<UserDetail[]>(
        `${API_BASE_URL}/analytics/user-details${qs ? `?${qs}` : ''}`,
      );

      return result ?? [];
    },
  });

  return { data: data ?? [], isLoading, error };
}
