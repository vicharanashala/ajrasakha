import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import type { PaginatedUserDetailsResponse } from './useUserDetails';

export function useUsersByDemographic(
  category?: string,
  value?: string,
  page = 1,
  limit = 10,
  search = '',
  source: 'vicharanashala' | 'annam' | 'whatsapp' = 'annam',
  userType: 'all' | 'external' | 'internal' = 'all',
  sortBy: 'name' | 'createdAt' | 'email' = 'name',
  sortOrder: 'asc' | 'desc' = 'asc',
  enabled = true,
) {
  const { data, isLoading, error, refetch } = useQuery<PaginatedUserDetailsResponse, Error>({
    queryKey: ['users-by-demographic', category, value, page, limit, search, source, userType, sortBy, sortOrder],
    staleTime: 30 * 1000,
    enabled: enabled && Boolean(category) && Boolean(value),
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();

      if (category?.trim()) params.set('category', category.trim());
      if (value?.trim()) params.set('value', value.trim());
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      params.set('source', source);
      if (userType !== 'all') params.set('userType', userType);
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);

      const result = await apiFetch<PaginatedUserDetailsResponse>(
        `${API_BASE_URL}/analytics/users-by-demographic?${params.toString()}`,
      );

      return result ?? {
        users: [],
        totalUsers: 0,
        totalPages: 1,
        activeUsers: 0,
        inactiveUsers: 0,
        totalQuestions: 0,
      };
    },
  });

  return {
    data: data ?? {
      users: [],
      totalUsers: 0,
      totalPages: 1,
      activeUsers: 0,
      inactiveUsers: 0,
      totalQuestions: 0,
    },
    isLoading,
    error,
    refetch,
  };
}
