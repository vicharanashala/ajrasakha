import { useQuery } from "@tanstack/react-query";
import { CropService } from "../../services/cropService";

const cropService = new CropService();

interface UseGetAllCropsParams {
  search?: string;
  page?: number;
  limit?: number;
}

export const useGetAllCrops = (params?: UseGetAllCropsParams) => {
  const { search = "", page = 1, limit = 10 } = params ?? {};

  return useQuery({
    queryKey: ["crops", search, page, limit],
    queryFn: async () => {
      return await cropService.getAllCrops({ search, page, limit, sort: "name_asc" });
    },
    placeholderData: (prev) => prev,
  });
};
