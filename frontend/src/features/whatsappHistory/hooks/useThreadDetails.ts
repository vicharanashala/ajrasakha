import { useQuery } from '@tanstack/react-query';
import { env } from '@/config/env';
import { apiFetch } from '@/hooks/api/api-fetch';
import type { Message } from '../types';

export function useThreadDetails(threadId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['whatsapp-thread-details', threadId, date],
    queryFn: async () => {
      if (!threadId || !date) return [];

      const data = await apiFetch<Message[]>(`${env.apiBaseUrl()}/whatsapp/threads/${threadId}/${date}`);
      if (!data) throw new Error('Failed to fetch thread details');
      return data;
    },
    enabled: !!threadId && !!date, // Only run the query if threadId and date are available
  });
}
