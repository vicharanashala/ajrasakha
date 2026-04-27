import { useQuery } from "@tanstack/react-query";
import { CropService } from "../../services/cropService";

const cropService = new CropService();

export const useGetAllCrops = () => {
  return useQuery({
    queryKey: ["crops"],
    queryFn: async () => {
      return await cropService.getAllCrops({ limit: 200, sort: "name_asc" });
    },
  });
};
