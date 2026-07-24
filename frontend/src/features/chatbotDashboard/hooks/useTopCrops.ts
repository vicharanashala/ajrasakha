import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import type { TopCropsResponse } from '../types';

export function useTopCrops(source: string, userType: string, enabled: boolean = true, coordinatorId?: string) {
  return useQuery<TopCropsResponse, Error>({
    queryKey: ['top-crops-chatbot', source, userType, coordinatorId],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();
      params.append("source", source);
      params.append("userType", userType);
      if (coordinatorId) {
        params.append("coordinatorId", coordinatorId);
      }
      const result = await apiFetch<TopCropsResponse>(
        `${API_BASE_URL}/analytics/top-crops?${params.toString()}`
      );
      return result || { totalQuestions: 0, topCrops: [] };
    },
    enabled,
  });
}
