import { useMutation } from "@tanstack/react-query";
import {
  fertilizerService,
  type IFertilizerCalculation,
} from "../../services/fertilizerService";

interface ICalculatePayload {
  crop: string;
  areaInAcres: number;
  soilType: string;
  state?: string;
}

export const useCalculateFertilizer = () => {
  return useMutation({
    mutationKey: ["calculateFertilizer"],
    mutationFn: async (
      payload: ICalculatePayload
    ): Promise<IFertilizerCalculation> => {
      return await fertilizerService.calculate(payload);
    },
  });
};
