import { useQuery } from "@tanstack/react-query";
import { CropService } from "../../services/cropService";
import type { AgriTechListFilters, AgriTechSort } from "../../services/cropService";

const cropService = new CropService();

interface UseGetAllCropsParams {
  search?: string;
  page?: number;
  limit?: number;
  // "crop" | "chemical" | "other" (all non-crop/non-chemical) | a specific
  // category such as "weed" | "pest" | "disease" | any future type.
  type?: string;
  sort?: AgriTechSort;
  filters?: AgriTechListFilters;
}

export const useGetAllCrops = (params?: UseGetAllCropsParams) => {
  const { search = "", page = 1, limit = 10, type, sort = "name_asc", filters } = params ?? {};

  return useQuery({
    queryKey: ["crops", search, page, limit, type, sort, filters],
    queryFn: async () => {
      return await cropService.getAllCrops({ search, page, limit, sort, type, filters });
    },
    placeholderData: (prev) => prev,
  });
};
