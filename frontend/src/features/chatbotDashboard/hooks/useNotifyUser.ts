import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from 'sonner';

export function useNotifyUser() {
  return useMutation({
    mutationFn: async ({
      userEmail,
      userId,
      source,
      messageId,
      message,
    }: {
      userEmail?: string;
      userId?: string;
      source: string;
      messageId?: string | null;
      message: string;
    }) => {
      const params = new URLSearchParams();
      if (userEmail) params.set('userEmail', userEmail);
      if (userId) params.set('userId', userId);
      params.set('source', source);
      if (messageId) params.set('messageId', messageId);
      params.set('message', message);

      const result = await apiFetch<any>(
        `${env.apiBaseUrl()}/analytics/notify-user?${params.toString()}`,
        {
          method: 'POST',
        },
      );

      return result;
    },

    onSuccess: () => {
      toast.success('Notification sent successfully');
    },

    onError: (error: any) => {
      toast.error(error?.message || 'Failed to send notification');
    },
  });
}