import { useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from '@/shared/components/toast';

export function useNotifyUser() {
  return useMutation({
    onMutate: ()=>{
      const toastId = toast.loading('sending...');
      return {toastId}
    },
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
        )}&message=${encodeURIComponent(message)}`,
        {
          method: 'POST',
        },
      );

      return result;
    },

    onSuccess: (_,__,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.success('Notification sent successfully');
    },

    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.error(error?.message || 'Failed to send notification');
    },
  });
}