import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface UserDetail {
  userId: string;
  name: string;
  email: string;
  totalQuestions: number;
}

export interface PaginatedUserDetailsResponse {
  users: UserDetail[];
  totalUsers: number;
  totalPages: number;
  activeUsers: number;
  totalQuestions: number;
}

export function useUserDetails(
  startDate?: Date,
  endDate?: Date,
  page = 1,
  limit = 10,
  search = '',
) {
  const startISO = startDate?.toISOString();
  const endISO = endDate?.toISOString();

  const { data, isLoading, error } = useQuery<PaginatedUserDetailsResponse, Error>({
    queryKey: ['user-details', startISO, endISO, page, limit, search],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();
      if (startISO) params.set('startDate', startISO);
      if (endISO) params.set('endDate', endISO);
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());

      const result = await apiFetch<PaginatedUserDetailsResponse>(
        `${API_BASE_URL}/analytics/user-details?${params.toString()}`,
      );

      return result ?? { users: [], totalUsers: 0, totalPages: 1, activeUsers: 0, totalQuestions: 0 };
    },
  });

  return {
    data: data ?? { users: [], totalUsers: 0, totalPages: 1, activeUsers: 0, totalQuestions: 0 },
    isLoading,
    error,
  };
}
