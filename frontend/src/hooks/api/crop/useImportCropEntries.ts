import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CropService,
  type ICropImportEntry,
  type ICropImportResponse,
} from "../../services/cropService";

const cropService = new CropService();

export const useImportCropEntries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["importCropEntries"],
    mutationFn: async ({
      type,
      entries,
    }: {
      type: string;
      entries: ICropImportEntry[];
    }): Promise<ICropImportResponse | null> => cropService.importEntries(type, entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crops"] });
      queryClient.invalidateQueries({ queryKey: ["crop-entry-types"] });
    },
  });
};
