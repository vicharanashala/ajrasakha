import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from 'sonner';

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, source }: { userId: string; source: string }) => {
      const result = await apiFetch(`${env.apiBaseUrl()}/analytics/users/${userId}?source=${source}`, {
        method: 'DELETE',
      });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      toast.success('Farmer removed successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to remove farmer');
    },
  });
}
