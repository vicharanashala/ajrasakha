import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CropService, type IBulkUploadCropResponse } from "../../services/cropService";

const cropService = new CropService();

export const useBulkUploadCrops = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["bulkUploadCrops"],
    mutationFn: async (file: File): Promise<IBulkUploadCropResponse | null> => {
      return cropService.bulkUploadCrops(file);
    },
    onSuccess: () => {
      // Invalidate after a short delay to allow the worker to process initial crops
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["crops"] });
      }, 3000);
    },
  });
};
