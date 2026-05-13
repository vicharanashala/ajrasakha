import { useQuery } from '@tanstack/react-query';
import { env } from '@/config/env';
import { apiFetch } from '@/hooks/api/api-fetch';
import type { Thread } from '../types';

export function useThreads() {
  return useQuery({
    queryKey: ['whatsapp-threads'],
    queryFn: async () => {
      const data = await apiFetch<Thread[]>(`${env.apiBaseUrl()}/whatsapp/threads`);
      if (!data) throw new Error('Failed to fetch threads');
      return data;
    },
  });
}
