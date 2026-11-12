import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "sonner";
import { useBulkUploadStore } from "@/stores/bulk-upload-store";

const questionService = new QuestionService();

export const useRdqaCheckQuestions = () => {
  const queryClient = useQueryClient();

  const pollRdqaCheckJob = (jobId: string, totalCount: number) => {
    const startedAt = Date.now();
    const { startJob, updateProgress, finishJob } = useBulkUploadStore.getState();
    startJob({ jobId, total: totalCount, operationType: "rdqa_check" });

    const tick = async () => {
      try {
        const job = await questionService.getRdqaCheckJobStatus(jobId);
        if (job) {
          const lastLog =
            job.logs && job.logs.length > 0
              ? job.logs[job.logs.length - 1]
              : undefined;

          updateProgress({
            processed: job.processed,
            passed: job.passed,
            flagged: job.flagged,
            failed: job.failed,
            latestLog: lastLog,
          });

          if (job.status !== "running") {
            // Invalidate RDQA questions queries to refresh UI
            queryClient.invalidateQueries({ queryKey: ["rdqa-questions"] });

            const passed = job.passed ?? 0;
            const flagged = job.flagged ?? 0;
            const failed = job.failed ?? 0;
            const isSuccess = job.status === "completed" || (job.processed > 0 && job.status !== "failed");

            finishJob({
              passed,
              flagged,
              failed,
              status: isSuccess ? "completed" : "failed",
            });

            if (isSuccess) {
              if (job.total === 1) {
                toast.success(
                  passed > 0
                    ? "Question quality check passed (0 flags)!"
                    : `Question quality check completed: ${flagged} flag(s) found.`,
                  { duration: 5000 }
                );
              } else {
                toast.success(
                  `RDQA quality check completed: ${passed} passed, ${flagged} flagged${
                    failed > 0 ? `, ${failed} errors` : ""
                  }.`,
                  { duration: 6000 }
                );
              }
            } else {
              toast.error(
                job.total === 1
                  ? "Quality check failed for this question."
                  : `RDQA check failed: 0 questions processed${
                      failed > 0 ? ` (${failed} errors)` : ""
                    }.`,
                { duration: 6000 }
              );
            }
            return;
          }
        }
      } catch (pollErr) {
        console.error("Failed to poll RDQA check job status:", pollErr);
      }

      // Poll every 2 seconds for up to 10 minutes
      if (Date.now() - startedAt < 10 * 60 * 1000) {
        setTimeout(tick, 2000);
      } else {
        queryClient.invalidateQueries({ queryKey: ["rdqa-questions"] });
      }
    };

    setTimeout(tick, 1000);
  };

  return useMutation({
    mutationKey: ["rdqaCheckQuestions"],
    mutationFn: async (
      questionIds: string[]
    ): Promise<{ message: string; jobId: string } | null> => {
      return questionService.checkRdqaQuestions(questionIds);
    },
    onSuccess: (data, questionIds) => {
      const jobId = data?.jobId;
      const totalCount = Array.isArray(questionIds) ? questionIds.length : 0;

      if (jobId && totalCount > 0) {
        toast.info(
          data?.message ||
            (totalCount === 1
              ? "Checking question quality..."
              : `Starting RDQA quality check for ${totalCount} question(s)...`),
          { duration: totalCount === 1 ? 3000 : 5000 }
        );
        pollRdqaCheckJob(jobId, totalCount);
      } else {
        if (data?.message) {
          toast.success(data.message);
        } else {
          toast.success("RDQA quality check started!");
        }
      }
    },
    onError: (error: any) => {
      console.error("RDQA check error:", error);
      toast.error(error?.message || "Failed to start RDQA quality check", {
        duration: 5000,
      });
    },
  });
};

