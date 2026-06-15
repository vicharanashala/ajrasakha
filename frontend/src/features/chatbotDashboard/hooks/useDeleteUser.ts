import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from '@/shared/components/toast';

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: ()=>{
      const toastId = toast.loading('remvoing farmer...');
      return {toastId}
    },
    mutationFn: async ({ userId, source }: { userId: string; source: string }) => {
      const result = await apiFetch(`${env.apiBaseUrl()}/analytics/users/${userId}?source=${source}`, {
        method: 'DELETE',
      });
      return result;
    },
    onSuccess: (_,__,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      toast.success('Farmer removed successfully');
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.error(error?.message || 'Failed to remove farmer');
    },
  });
}
