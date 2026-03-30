import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CropService, type ICreateCropPayload, type ICreateCropResponse } from "../../services/cropService";

const cropService = new CropService();

export const useCreateCrop = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["createCrop"],
    mutationFn: async (payload: ICreateCropPayload): Promise<ICreateCropResponse | null> => {
      return await cropService.createCrop(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crops"] });
    },
  });
};
