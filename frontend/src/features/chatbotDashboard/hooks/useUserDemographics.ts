import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface DemographicEntry {
  label: string;
  count: number;
  pct: number;
}

export interface UserDemographics {
  ageGroups: DemographicEntry[];
  genderSplit: DemographicEntry[];
  farmingExperience: DemographicEntry[];
}

const EMPTY: UserDemographics = { ageGroups: [], genderSplit: [], farmingExperience: [] };

export function useUserDemographics(source: 'vicharanashala' | 'annam' = 'vicharanashala') {
  const { data, isLoading, error } = useQuery<UserDemographics, Error>({
    queryKey: ['user-demographics', source],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<UserDemographics>(
        `${API_BASE_URL}/analytics/user-demographics?source=${source}`,
      );
      return result ?? EMPTY;
    },
  });

  return { data: data ?? EMPTY, isLoading, error };
}
