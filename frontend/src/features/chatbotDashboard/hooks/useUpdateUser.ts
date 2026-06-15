import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';
import { toast } from '@/shared/components/toast';

type FarmerProfileUpdate = {
  farmerName?: string;
  age?: number;
  gender?: string | null;
  villageName?: string | null;
  blockName?: string | null;
  district?: string | null;
  state?: string | null;
  phoneNo?: string;
  nearestKVK?: string,
  languagePreference?: string;
  landhold?: number;
  yearsOfExperience?: number;
  cropsCultivated?: string[];
  primaryCrop?: string;
  secondaryCrop?: string;
  awarenessOfKCC?: boolean;
  usesAgriApps?: boolean;
  highestEducatedPerson?: string | null;
  numberOfSmartphones?: number;
  platform?: string;
};

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    onMutate: ()=>{
      const toastId = toast.loading('updating farmer...')
      return {toastId}
    },
    mutationFn: async ({
      userId,
      source,
      data,
    }: {
      userId: string;
      source: string;
      data: {
        name?: string;
        userRole?: string;
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
    onSuccess: (_,__,context) => {
      queryClient.invalidateQueries({ queryKey: ['user-details'] });
      if(context?.toastId)toast.dismiss(context.toastId)
      toast.success('Farmer updated successfully');
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId)
      toast.error(error?.message || 'Failed to update farmer');
    },
  });
}

export function useAssignUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      userIds,
    }: {
      userId: string;
      userIds: string[];
    }) => {
      return apiFetch(
        `${env.apiBaseUrl()}/analytics/assign-users/${userId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            userIds,
          }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["assign-users"],
      });
      toast.success("Users assigned successfully");
    },
  });
}

export function useUnassignUsers() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      userId,
      userIds,
    }: {
      userId: string;
      userIds: string[];
    }) => {
      return apiFetch(
        `${env.apiBaseUrl()}/analytics/unassign-users/${userId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            userIds,
          }),
        },
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["unassign-users"],
      });
      toast.success("Users unassigned successfully");
    },
  });
}
