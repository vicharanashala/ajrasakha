import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface FarmerProfile {
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
}

export interface UserDetail {
  userId: string;
  name: string;
  email: string;
  totalQuestions: number;
  farmerProfile?: FarmerProfile;
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
  source: 'vicharanashala' | 'annam' = 'vicharanashala',
) {
  const startISO = startDate?.toISOString();
  // Extend endDate to end of day (23:59:59.999) so the selected day is fully included.
  // react-day-picker sets the date to midnight, which would exclude the entire selected day.
  const endISO = endDate
    ? new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
    : undefined;

  const { data, isLoading, error } = useQuery<PaginatedUserDetailsResponse, Error>({
    queryKey: ['user-details', startISO, endISO, page, limit, search, source],
    staleTime: 30 * 1000,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();
      if (startISO) params.set('startDate', startISO);
      if (endISO) params.set('endDate', endISO);
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      params.set('source', source);

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
