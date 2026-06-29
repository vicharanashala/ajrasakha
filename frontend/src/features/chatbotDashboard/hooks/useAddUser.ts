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
        role?: 'district_coordinator' | 'block_coordinator' | 'village_volunteer';
        isVerified?: boolean;
        target?: 'web_app' | 'review_system';
      };
    }) => {
      let reviewResult;

      if (
        data.target === 'review_system' ||
        data.userRole === 'district_coordinator' ||
        data.userRole === 'block_coordinator'
      ) {
        reviewResult = await apiFetch<any>(
          `${env.apiBaseUrl()}/auth/admin/review-users`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: data.email,
              name: data.name,
              password: data.password,
              role: data.role || data.userRole,
              isVerified: data.isVerified,
            }),
          },
        );
        if (data.target === 'review_system') {
          return reviewResult;
        }
      }

      const result = await apiFetch<any>(
        `${env.apiBaseUrl()}/analytics/users?source=${source}`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      return { ...result, reviewResult };
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      if (variables.data.target === 'review_system') {
        queryClient.invalidateQueries({ queryKey: ['admin'] });
        toast.success('Review system user added successfully');
        return;
      }
      if (
        variables.data.userRole === 'district_coordinator' ||
        variables.data.userRole === 'block_coordinator'
      ) {
        queryClient.invalidateQueries({ queryKey: ['admin'] });
        toast.success('User added to both systems successfully');
        return;
      }
      toast.success('Farmer added successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to add user');
    },
  });
}
