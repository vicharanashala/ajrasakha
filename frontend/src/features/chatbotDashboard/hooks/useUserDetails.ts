import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/hooks/api/api-fetch';
import { env } from '@/config/env';

export interface FarmerProfile {
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
  landhold?: number;
  cropsCultivated?: string[];
  primaryCrop?: string;
  secondaryCrop?: string;
  awarenessOfKCC?: boolean;
  usesAgriApps?: boolean;
  nearestKVK?: string;
  highestEducatedPerson?: string;
  numberOfSmartphones?: number;
  platform?: string;
  platformHistory?: { os: string; timestamp: string }[];
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface UserDetail {
  userId: string;
  name: string;
  email: string;
  role?: string;
  userRole?: string;
  totalQuestions: number;
  farmerProfile?: FarmerProfile;
  createdAt?: string;
  isVerified?: boolean;
}

export interface PaginatedUserDetailsResponse {
  users: UserDetail[];
  totalUsers: number;
  totalPages: number;
  // userRoleCounts?: {coordinator: number, farmer: number, internal: number};
  activeUsers: number;
  inactiveUsers: number;
  totalQuestions: number;
}

export function useUserDetails(
  startDate?: Date,
  endDate?: Date,
  page = 1,
  limit = 10,
  search = '',
  source: 'vicharanashala' | 'annam' | 'whatsapp' = 'vicharanashala',
  crop = '',
  primaryCrops: string[] = [],
  secondaryCrops: string[] = [],
  village = '',
  state = '',
  district = '',
  block = '',
  profileCompleted: 'all' | 'yes' | 'no' = 'all',
  inactiveOnly = false,
  lowFeedbackOnly = false,
  userType: 'all' | 'external' | 'internal' = 'all',
  roles: string[] = [],
  sortBy: 'totalQuestions' | 'name' | 'farmerName' | 'email' | 'createdAt' = 'name',
  sortOrder: 'asc' | 'desc' = 'asc',
  activeTodayByProfile = false,
  missingDemographicField = '',
  verificationStatus: 'all' | 'verified' | 'unverified' = 'all',
  enabled = true,
) {
  const startISO = startDate?.toISOString();
  // Extend endDate to end of day (23:59:59.999) so the selected day is fully included.
  // react-day-picker sets the date to midnight, which would exclude the entire selected day.
  const endISO = endDate
    ? new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
    : undefined;

  const { data, isLoading, error, refetch } = useQuery<PaginatedUserDetailsResponse, Error>({
    queryKey: ['user-details', startISO, endISO, page, limit, search, source, crop, primaryCrops, secondaryCrops, village, state, district, block, profileCompleted, inactiveOnly, lowFeedbackOnly, userType, roles, sortBy, sortOrder, activeTodayByProfile, missingDemographicField, verificationStatus],
    staleTime: 30 * 1000,
    enabled,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();
      const params = new URLSearchParams();
      if (startISO) params.set('startDate', startISO);
      if (endISO) params.set('endDate', endISO);
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (search.trim()) params.set('search', search.trim());
      params.set('source', source);
      if (crop.trim()) params.set('crop', crop.trim());
      if (primaryCrops.length) params.set('primaryCrops', primaryCrops.join(','));
      if (secondaryCrops.length) params.set('secondaryCrops', secondaryCrops.join(','));
      if (village.trim()) params.set('village', village.trim());
      if (state.trim()) params.set('state', state.trim());
      if (district.trim()) params.set('district', district.trim());
      if (block.trim()) params.set('block', block.trim());
      if (profileCompleted !== 'all') params.set('profileCompleted', profileCompleted);
      if (inactiveOnly) params.set('inactiveOnly', 'true');
      if (lowFeedbackOnly) params.set('lowFeedbackOnly', 'true');
      if (userType !== 'all') params.set('userType', userType);
      if (roles.length) params.set('roles', roles.join(','));
      params.set('sortBy', sortBy);
      params.set('sortOrder', sortOrder);
      if (activeTodayByProfile) params.set('activeTodayByProfile', 'true');
      if (missingDemographicField) params.set('missingDemographicField', missingDemographicField);
      if (verificationStatus !== 'all') {
        params.set('isVerified', String(verificationStatus === 'verified'));
      }

      const result = await apiFetch<PaginatedUserDetailsResponse>(
        `${API_BASE_URL}/analytics/user-details?${params.toString()}`,
      );

      return result ?? { users: [], totalUsers: 0, totalPages: 1, activeUsers: 0, inactiveUsers: 0, totalQuestions: 0 };
    },
  });

  return {
    data: data ?? { users: [], totalUsers: 0, totalPages: 1, activeUsers: 0, inactiveUsers: 0, totalQuestions: 0 },
    isLoading,
    error,
    refetch,
  };
}

export function useUserProfile(userId: string, enabled?: boolean) {
  return useQuery<any, Error>({
    queryKey: ['user-profile', userId],
    staleTime: 30 * 1000,
    enabled,
    queryFn: async () => {
      const API_BASE_URL = env.apiBaseUrl();

      const params = new URLSearchParams();
      params.set('userId', userId);

      const result = await apiFetch<any>(
        `${API_BASE_URL}/analytics/user-profile?${params.toString()}`
      );

      return result ?? {};
    },
  });
}
