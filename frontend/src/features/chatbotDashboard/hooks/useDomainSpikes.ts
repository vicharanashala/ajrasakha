import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import type { DomainSpikeEntry } from '../components/DomainSpikesModal';

export function useDomainSpikes(enabled = false, days = 60) {
  return useQuery<DomainSpikeEntry[], Error>({
    queryKey: ['domain-spikes', days],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const result = await apiFetch<DomainSpikeEntry[]>(
        `${API_BASE_URL}/analytics/domain-spikes?days=${days}`
      );
      return result ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — spikes don't change that fast
  });
}
