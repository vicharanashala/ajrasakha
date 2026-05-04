import { useQuery } from "@tanstack/react-query";
import { CropService } from "../../services/cropService";

const cropService = new CropService();

interface UseGetAllCropsParams {
  search?: string;
  page?: number;
  limit?: number;
  type?: "crop" | "chemical" | "other";
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
