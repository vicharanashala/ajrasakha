import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CropService, type IUpdateCropPayload, type ICreateCropResponse } from "../../services/cropService";

const cropService = new CropService();

export const useUpdateCrop = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["updateCrop"],
    mutationFn: async ({ cropId, payload }: { cropId: string; payload: IUpdateCropPayload }): Promise<ICreateCropResponse | null> => {
      return await cropService.updateCrop(cropId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crops"] });
    },
  });
};
