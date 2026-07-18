import { useQuery } from "@tanstack/react-query";
import {
  fertilizerService,
  type ISoilType,
} from "../../services/fertilizerService";

export const useGetSoilTypes = () => {
  return useQuery({
    queryKey: ["fertilizerSoilTypes"],
    queryFn: async (): Promise<ISoilType[]> => {
      return await fertilizerService.getSoilTypes();
    },
  });
};
