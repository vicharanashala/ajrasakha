import { useQuery } from "@tanstack/react-query";
import { CropService, type IGetAffectedQuestionsResponse } from "../../services/cropService";

const cropService = new CropService();

export const useGetCropAffectedQuestions = (cropId?: string, enabled = true) => {
  return useQuery<IGetAffectedQuestionsResponse | null>({
    queryKey: ["cropAffectedQuestions", cropId],
    queryFn: async () => {
      if (!cropId) return null;
      return await cropService.getAffectedQuestions(cropId);
    },
    enabled: Boolean(cropId && enabled),
    staleTime: 0,
  });
};
