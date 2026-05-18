import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import type { TopCropsResponse } from '../types';

export function useTopCrops() {
  return useQuery<TopCropsResponse, Error>({
    queryKey: ['top-crops-chatbot'],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<TopCropsResponse>(
        `${API_BASE_URL}/analytics/top-crops`
      );
      return result || { totalQuestions: 0, topCrops: [] };
    },
  });
}
