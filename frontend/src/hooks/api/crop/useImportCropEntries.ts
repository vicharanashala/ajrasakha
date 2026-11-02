import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CropService,
  type ICropImportEntry,
  type ICropImportResponse,
} from "../../services/cropService";

const cropService = new CropService();

/** How often the import job is polled while it runs. */
const POLL_INTERVAL_MS = 1500;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Starts a sheet import on the server and polls the job until it finishes, so a large
// import is never cut off by the request timeout. Progress is reported as it arrives.
export const useImportCropEntries = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["importCropEntries"],
    mutationFn: async ({
      type,
      entries,
      fileName,
      onProgress,
    }: {
      type: string;
      entries: ICropImportEntry[];
      /** Shown in the audit trail so an import can be traced back to its file. */
      fileName?: string;
      onProgress?: (processed: number, total: number) => void;
    }): Promise<ICropImportResponse | null> => {
      const started = await cropService.startImport(type, entries, fileName);
      if (!started?.jobId) throw new Error("Could not start the import");
      onProgress?.(0, started.total);

      for (;;) {
        await wait(POLL_INTERVAL_MS);
        const job = await cropService.getImportJob(started.jobId);
        if (!job) throw new Error("Lost track of the import. Check the audit trail for its result.");
        onProgress?.(job.processed, job.total);
        if (job.status === "completed") return job.result ?? null;
        if (job.status === "failed") throw new Error(job.error || "Import failed");
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["crops"] });
      queryClient.invalidateQueries({ queryKey: ["crop-entry-types"] });
    },
  });
};
