import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CropService, type IBulkUploadCropResponse, type CropUploadType } from "../../services/cropService";

const cropService = new CropService();

export const useBulkUploadCrops = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["bulkUploadCrops"],
    mutationFn: async ({ file, type }: { file: File; type: CropUploadType }): Promise<IBulkUploadCropResponse | null> => {
      return cropService.bulkUploadCrops(file, type);
    },
    onSuccess: () => {
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["crops"] });
        // A bulk upload can introduce a new custom type — refresh the tab list.
        queryClient.invalidateQueries({ queryKey: ["crop-entry-types"] });
      }, 3000);
    },
  });
};
