import { useQuery } from "@tanstack/react-query";
import { CropService } from "../../services/cropService";

const cropService = new CropService();

interface UseGetAllCropsParams {
  search?: string;
  page?: number;
  limit?: number;
  // "crop" | "chemical" | "other" (all non-crop/non-chemical) | a specific
  // category such as "weed" | "pest" | "disease" | any future type.
  type?: string;
}

export const useGetAllCrops = (params?: UseGetAllCropsParams) => {
  const { search = "", page = 1, limit = 10, type } = params ?? {};

  return useQuery({
    queryKey: ["crops", search, page, limit, type],
    queryFn: async () => {
      return await cropService.getAllCrops({ search, page, limit, sort: "name_asc", type });
    },
    placeholderData: (prev) => prev,
  });
};
