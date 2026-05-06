import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CropService, type IBulkUploadCropResponse } from "../../services/cropService";

const cropService = new CropService();

export const useBulkUploadCrops = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["bulkUploadCrops"],
    mutationFn: async ({ file, type }: { file: File; type: "crop" | "chemical" }): Promise<IBulkUploadCropResponse | null> => {
      return cropService.bulkUploadCrops(file, type);
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["crops"] });
      }, 3000);
    },
  });
};
