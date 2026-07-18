import { useQuery } from "@tanstack/react-query";
import {
  fertilizerService,
  type ICropInfo,
} from "../../services/fertilizerService";

export const useGetFertilizerCrops = () => {
  return useQuery({
    queryKey: ["fertilizerCrops"],
    queryFn: async (): Promise<ICropInfo[]> => {
      return await fertilizerService.getCrops();
    },
  });
};
