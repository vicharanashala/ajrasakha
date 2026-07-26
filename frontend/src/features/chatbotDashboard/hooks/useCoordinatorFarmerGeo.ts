import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";

export interface CoordinatorFarmerGeo {
  userId: string;
  name: string;
  email: string;
  userRole: string;
  farmerProfile: {
    farmerName?: string;
    district?: string;
    blockName?: string;
    villageName?: string;
    primaryCrop?: string;
    cropsCultivated?: string[];
    state?: string;
  };
  location: { latitude: number; longitude: number } | null;
  totalQuestions: number;
  closedQuestions: number;
  lastQuestionAt: string | null;
}

export interface CoordinatorFarmerGeoResponse {
  coordinatorId: string;
  coordinatorRole: string;
  scope: {
    district?: string;
    block?: string;
    state?: string;
  };
  farmers: CoordinatorFarmerGeo[];
  stats: {
    total: number;
    withLocation: number;
    totalQuestions: number;
  };
}

const EMPTY_RESPONSE: CoordinatorFarmerGeoResponse = {
  coordinatorId: "",
  coordinatorRole: "",
  scope: {},
  farmers: [],
  stats: { total: 0, withLocation: 0, totalQuestions: 0 },
};

export function useCoordinatorFarmerGeo(coordinatorId: string, enabled = true) {
  return useQuery<CoordinatorFarmerGeoResponse, Error>({
    queryKey: ["coordinator-farmer-geo", coordinatorId],
    enabled: enabled && Boolean(coordinatorId),
    staleTime: 60_000,
    queryFn: async () =>
      (await apiFetch<CoordinatorFarmerGeoResponse>(
        `${env.apiBaseUrl()}/analytics/coordinator-farmers-geo/${coordinatorId}`,
      )) ?? EMPTY_RESPONSE,
  });
}
