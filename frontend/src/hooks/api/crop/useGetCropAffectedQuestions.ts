import { useQuery } from "@tanstack/react-query";
import {
  CropService,
  type IGetAffectedQuestionsParams,
  type IGetAffectedQuestionsResponse,
} from "../../services/cropService";

const cropService = new CropService();

export const useGetCropAffectedQuestions = (
  cropId?: string,
  params?: IGetAffectedQuestionsParams,
  enabled = true,
) => {
  return useQuery<IGetAffectedQuestionsResponse | null>({
    queryKey: ["cropAffectedQuestions", cropId, params?.page, params?.limit, params?.search],
    queryFn: async () => {
      if (!cropId) return null;
      return await cropService.getAffectedQuestions(cropId, params);
    },
    enabled: Boolean(cropId && enabled),
    staleTime: 0,
  });
};
