import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from 'sonner';

type FarmerProfileUpdate = {
  farmerName?: string;
  age?: number;
  gender?: string;
  villageName?: string;
  blockName?: string;
  district?: string;
  state?: string;
  phoneNo?: string;
  languagePreference?: string;
  yearsOfExperience?: number;
  cropsCultivated?: string[];
  primaryCrop?: string;
  secondaryCrop?: string;
  awarenessOfKCC?: boolean;
  usesAgriApps?: boolean;
  highestEducatedPerson?: string;
  numberOfSmartphones?: number;
  platform?: string;
  platformHistory?: { os: string; timestamp: string }[];
};

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      source,
      data,
    }: {
      userId: string;
      source: string;
      data: {
        name?: string;
        farmerProfile?: FarmerProfileUpdate;
      };
    }) => {
      const result = await apiFetch(
        `${env.apiBaseUrl()}/analytics/users/${userId}?source=${source}`,
        {
          method: 'PATCH',
          body: JSON.stringify(data),
        },
      );
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      toast.success('Farmer updated successfully');
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Failed to update farmer');
    },
  });
}
