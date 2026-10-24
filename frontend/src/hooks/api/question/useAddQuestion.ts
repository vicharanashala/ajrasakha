import { useMutation, useQueryClient } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import { toast } from "@/shared/components/toast";
import type { IDetailedQuestion } from "@/types";
import { useBulkUploadStore } from "@/stores/bulk-upload-store";

const questionService = new QuestionService();

export const useAddQuestion = (
  onUploaded?: (count: number, isBulkUpload: boolean) => void
) => {
  const queryClient = useQueryClient();

  const pollBulkJob = (jobId: string, totalCount: number) => {
    const startedAt = Date.now();
    const { startJob, updateProgress, finishJob } = useBulkUploadStore.getState();
    startJob({ jobId, total: totalCount });

    const tick = async () => {
      try {
        const job = await questionService.getBulkJobStatus(jobId);
        if (job) {
          const lastLog =
            job.logs && job.logs.length > 0
              ? job.logs[job.logs.length - 1]
              : undefined;

          updateProgress({
            processed: job.processed,
            created: job.created,
            duplicates: job.duplicates,
            failed: job.failed,
            latestLog: lastLog,
          });

          if (job.status !== "running") {
            queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
            queryClient.invalidateQueries({ queryKey: ["audit_trails"] });

            const created = job.created ?? 0;
            const duplicates = job.duplicates ?? 0;
            const failed = job.failed ?? 0;
            const isSuccess = job.status === "completed" || created > 0;

            finishJob({
              created,
              duplicates,
              failed,
              status: isSuccess ? "completed" : "failed",
            });

            if (isSuccess) {
              toast.success(
                `Bulk upload finished: ${created} question(s) added${
                  duplicates > 0 ? `, ${duplicates} duplicates skipped` : ""
                }${failed > 0 ? `, ${failed} failed` : ""}.`,
                { duration: 6000 }
              );
            } else {
              toast.error(
                `Bulk upload failed: 0 questions added${
                  duplicates > 0 ? ` (${duplicates} duplicates skipped)` : ""
                }${failed > 0 ? ` (${failed} errors)` : ""}.`,
                { duration: 6000 }
              );
            }
            return;
          }
        }
      } catch (pollErr) {
        console.error("Failed to poll question bulk job status:", pollErr);
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
    mutationKey: ["addQuestion"],
    mutationFn: async (
      newQuestionData: Partial<IDetailedQuestion> | FormData
    ) => {
      if (newQuestionData instanceof FormData) {
        return await questionService.addQuestion(newQuestionData, true);
      }
      return await questionService.addQuestion(newQuestionData);
    },
    onSuccess: (data: any) => {
      const count = data?.insertedIds?.length ?? data?.count ?? 0;
      const isBulk = Boolean(data?.isBulkUpload);
      const jobId = data?.jobId;

      if (count > 0) {
        onUploaded?.(count, isBulk);
      }

      if (isBulk && jobId) {
        toast.info(
          data?.message || `Processing ${count} question(s) in background...`,
          { duration: 5000 }
        );
        pollBulkJob(jobId, count);
      } else {
        queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
        if (data?.message) {
          toast.success(data.message);
        } else {
          toast.success("Question added successfully!");
        }
      }
    },
    onError: (error: any) => {
      toast.error(error?.message || "Failed to add question");
      console.error("Add question error:", error);
    },
  });
};

