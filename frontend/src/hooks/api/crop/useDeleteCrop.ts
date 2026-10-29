import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CropService,
  type IDeleteCropPayload,
  type IDeleteCropResponse,
} from "../../services/cropService";

const cropService = new CropService();

export const useDeleteCrop = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["deleteCrop"],
    mutationFn: async ({
      cropId,
      payload,
    }: {
      cropId: string;
      payload: IDeleteCropPayload;
    }): Promise<IDeleteCropResponse | null> => {
      return await cropService.deleteOrReassignCrop(cropId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crops"] });
      queryClient.invalidateQueries({ queryKey: ["crop-entry-types"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      queryClient.invalidateQueries({ queryKey: ["cropAffectedQuestions"] });
      queryClient.invalidateQueries({ queryKey: ["normalisedCropsList"] });
    },
  });
};
