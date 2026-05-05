import { useQuery } from '@tanstack/react-query';
import { env } from '@/config/env';
import { apiFetch } from '@/hooks/api/api-fetch';
import type { Message } from '../types';

export function useThreadDetails(threadId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-thread-details', threadId],
    queryFn: async () => {
      if (!threadId) return [];

      const data = await apiFetch<Message[]>(`${env.apiBaseUrl()}/whatsapp/threads/${threadId}`);
      if (!data) throw new Error('Failed to fetch thread details');
      return data;
    },
    enabled: !!threadId,
  });
}
