import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import type { DomainSpikeEntry } from '../components/DomainSpikesModal';

export function useDomainSpikes(enabled = false, days = 60, coordinatorId?: string) {
  return useQuery<DomainSpikeEntry[], Error>({
    queryKey: ['domain-spikes', days, coordinatorId],
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();
      params.append("days", days.toString());
      if (coordinatorId) params.append("coordinatorId", coordinatorId);
      const result = await apiFetch<DomainSpikeEntry[]>(
        `${API_BASE_URL}/analytics/domain-spikes?${params.toString()}`
      );
      return result ?? [];
    },
    enabled,
    staleTime: 5 * 60 * 1000, // 5 min — spikes don't change that fast
  });
}
