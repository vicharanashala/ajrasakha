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
      fileName,
    }: {
      type: string;
      entries: ICropImportEntry[];
      /** Shown in the audit trail so an import can be traced back to its file. */
      fileName?: string;
    }): Promise<ICropImportResponse | null> => cropService.importEntries(type, entries, fileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["crops"] });
      queryClient.invalidateQueries({ queryKey: ["crop-entry-types"] });
    },
  });
};
