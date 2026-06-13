import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from '@/shared/components/toast';

export function useAddUser() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: ()=>{
      const toastId = toast.loading('adding user...')
      return {toastId}
    },
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
    onSuccess: (_data, variables,context) => {
      if(context?.toastId)toast.dismiss(context.toastId)
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      if (variables.data.target === 'review_system') {
        queryClient.invalidateQueries({ queryKey: ['admin'] });
        toast.success('Review system user added successfully');
        return;
      }
      toast.success('Farmer added successfully');
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId)
      toast.error(error?.message || 'Failed to add user');
    },
  });
}
