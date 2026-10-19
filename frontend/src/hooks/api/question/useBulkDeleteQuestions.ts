import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";
import { useBulkUploadStore } from "@/stores/bulk-upload-store";

const questionService = new QuestionService();

export const useBulkDeleteQuestions = () => {
  const queryClient = useQueryClient();

  const pollBulkDeleteJob = (jobId: string, totalCount: number) => {
    const startedAt = Date.now();
    const { startJob, updateProgress, finishJob } = useBulkUploadStore.getState();
    startJob({ jobId, total: totalCount, operationType: "delete" });

    const tick = async () => {
      try {
        const job = await questionService.getBulkDeleteJobStatus(jobId);
        if (job) {
          const lastLog =
            job.logs && job.logs.length > 0
              ? job.logs[job.logs.length - 1]
              : undefined;

          updateProgress({
            processed: job.processed,
            deleted: job.deleted,
            failed: job.failed,
            latestLog: lastLog,
          });

          if (job.status !== "running") {
            queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
            queryClient.invalidateQueries({ queryKey: ["audit_trails"] });

            const deleted = job.deleted ?? 0;
            const failed = job.failed ?? 0;
            const isSuccess = job.status === "completed" || deleted > 0;

            finishJob({
              deleted,
              failed,
              status: isSuccess ? "completed" : "failed",
            });

            if (isSuccess) {
              toast.success(
                `Bulk delete finished: ${deleted} question(s) deleted${
                  failed > 0 ? `, ${failed} failed` : ""
                }.`,
                { duration: 6000 }
              );
            } else {
              toast.error(
                `Bulk delete failed: 0 questions deleted${
                  failed > 0 ? ` (${failed} errors)` : ""
                }.`,
                { duration: 6000 }
              );
            }
            return;
          }
        }
      } catch (pollErr) {
        console.error("Failed to poll bulk delete job status:", pollErr);
      }

      // Poll every 2 seconds for up to 8 minutes
      if (Date.now() - startedAt < 8 * 60 * 1000) {
        setTimeout(tick, 2000);
      } else {
        queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
      }
    };

    setTimeout(tick, 1000);
  };

  return useMutation({
    mutationKey: ["bulkDeleteQuestions"],
    mutationFn: async (
      questionIds: string[]
    ): Promise<{ message: string; jobId: string } | null> => {
      return questionService.bulkDeleteQuestions(questionIds);
    },
    onSuccess: (data, questionIds) => {
      const jobId = data?.jobId;
      const totalCount = Array.isArray(questionIds) ? questionIds.length : 0;

      if (jobId && totalCount > 0) {
        toast.info(
          data?.message || `Deleting ${totalCount} question(s) in background...`,
          { duration: 5000 }
        );
        pollBulkDeleteJob(jobId, totalCount);
      } else {
        if (data?.message) {
          toast.success(data.message);
        } else {
          toast.success("Questions deleted successfully!");
        }
        queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to delete questions");
      console.error("Bulk delete error:", error);
    },
  });
};
