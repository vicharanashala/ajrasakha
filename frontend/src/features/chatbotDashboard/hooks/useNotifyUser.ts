import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from 'sonner';

export function useNotifyUser() {
  return useMutation({
    mutationFn: async ({
      userEmail,
      messageId,
      message,
    }: {
      userEmail: string;
      messageId: string;
      message: string | null ;
    }) => {
      const result = await apiFetch<any>(
        `${env.apiBaseUrl()}/analytics/notify-user?userEmail=${encodeURIComponent(
          userEmail,
        )}&messageId=${encodeURIComponent(
          messageId,
        // @ts-ignore
        )}&message=${encodeURIComponent(message)}`,
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