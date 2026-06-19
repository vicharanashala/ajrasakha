import { useQuery } from "@tanstack/react-query";
import { LocationService } from "../../services/locationService";

const locationService = new LocationService();

export const useGetStates = () => {
  return useQuery({
    queryKey: ["states"],
    queryFn: async () => {
      const data = await locationService.getStates();
      return data ?? [];
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
};

export const useGetDistricts = (stateCode?: number | null) => {
  return useQuery({
    queryKey: ["districts", stateCode],
    queryFn: async () => {
      if (!stateCode) return [];
      const data = await locationService.getDistricts(stateCode);
      return data ?? [];
    },
    enabled: !!stateCode,
    staleTime: 1000 * 60 * 60 * 24,
  });
};

export const useGetBlocks = (districtCode?: number | null) => {
  return useQuery({
    queryKey: ["blocks", districtCode],
    queryFn: async () => {
      if (!districtCode) return [];
      const data = await locationService.getBlocks(districtCode);
      return data ?? [];
    },
    enabled: !!districtCode,
    staleTime: 1000 * 60 * 60 * 24,
  });
};

export const useGetVillages = (blockCode?: number | null) => {
  return useQuery({
    queryKey: ["villages", blockCode],
    queryFn: async () => {
      if (!blockCode) return [];
      const data = await locationService.getVillages(blockCode);
      return data ?? [];
    },
    enabled: !!blockCode,
    staleTime: 1000 * 60 * 60 * 24,
  });
};
