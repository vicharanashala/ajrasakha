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
        target?: 'web_app' | 'review_system' | 'both';
      };
    }) => {
      if (data.target === 'both') {
        await apiFetch<any>(
          `${env.apiBaseUrl()}/auth/admin/review-users`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: data.email,
              name: data.name,
              password: data.password,
              role: data.role,
              isVerified: data.isVerified,
              linkedWithWebApp: true,
            }),
          },
        );

        const result = await apiFetch<any>(
          `${env.apiBaseUrl()}/analytics/users?source=${source}`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: data.email,
              name: data.name,
              password: data.password,
              isVerified: data.isVerified,
              userRole: data.userRole
            }),
          },
        );
        return result;
      }

      if (data.target === 'review_system') {
        const result = await apiFetch<any>(
          `${env.apiBaseUrl()}/auth/admin/review-users`,
          {
            method: 'POST',
            body: JSON.stringify({
              email: data.email,
              name: data.name,
              password: data.password,
              role: data.role,
              isVerified: data.isVerified,
              linkedWithWebApp: false,
            }),
          },
        );
        return result;
      }

      const result = await apiFetch<any>(
        `${env.apiBaseUrl()}/analytics/users?source=${source}`,
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );
      return result;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      if (variables.data.target === 'review_system' || variables.data.target === 'both') {
        queryClient.invalidateQueries({ queryKey: ['admin'] });
      }
      
      if (variables.data.target === 'both') {
        toast.success('Coordinator added to both databases successfully');
      } else if (variables.data.target === 'review_system') {
        toast.success('Review system user added successfully');
      } else {
        toast.success('Farmer added successfully');
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to add user');
    },
  });
}
