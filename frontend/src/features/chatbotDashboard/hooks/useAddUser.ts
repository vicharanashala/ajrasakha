import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from '@/shared/components/toast';

export function useAddUser() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: ()=>{
      const toastId = toast.loading('adding farmer...')
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
        isVerified?: boolean;
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
    onSuccess: (_,__,context) => {
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      if(context?.toastId)toast.dismiss(context.toastId)
      toast.success('Farmer added successfully');
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId)
      toast.error(error?.message || 'Failed to add farmer');
    },
  });
}
