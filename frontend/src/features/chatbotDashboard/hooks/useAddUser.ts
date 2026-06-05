import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from 'sonner';

export function useAddUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      source,
      data,
    }: {
      source: string;
      data: {
        email: string;
        name: string;
        password: string
        userRole?: string;
      };
    }) => {
      const result = await apiFetch<any>(
        `${env.apiBaseUrl()}/analytics/users?source=${source}`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      toast.success('Farmer added successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to add farmer');
    },
  });
}
