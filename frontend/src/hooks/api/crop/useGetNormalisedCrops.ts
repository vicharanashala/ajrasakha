import { useQuery } from "@tanstack/react-query";
import { CropService, type ICropResponse } from "../../services/cropService";

const cropService = new CropService();

export const useGetNormalisedCrops = (enabled = true) => {
  return useQuery<{ crops: ICropResponse[] } | null>({
    queryKey: ["normalisedCropsList"],
    queryFn: async () => {
      return await cropService.getNormalisedCrops();
    },
    enabled,
    staleTime: 30 * 1000,
  });
};
