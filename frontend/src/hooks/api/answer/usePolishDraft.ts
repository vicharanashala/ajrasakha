import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  WritingAssistantService,
  type PolishDraftPayload,
  type PolishDraftResponse,
  type PolishDraftSubmitResponse,
  type PolishDraftJobResponse,
} from "@/hooks/services/writingAssistantService";

const writingAssistantService = new WritingAssistantService();

export interface UsePolishDraftReturn {
  polishDraft: (payload: PolishDraftPayload) => void;
  isPolishing: boolean;
  result: PolishDraftResponse | null;
  error: Error | null;
  reset: () => void;
  activeJobId: string | null;
}

export const usePolishDraft = (): UsePolishDraftReturn => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // 1. Submit mutation to get a jobId
  const submitMutation = useMutation<PolishDraftSubmitResponse, Error, PolishDraftPayload>({
    mutationKey: ["submitPolishDraft"],
    mutationFn: async (payload: PolishDraftPayload) => {
      return await writingAssistantService.submitPolishDraft(payload);
    },
    onSuccess: (data) => {
      if (data?.jobId) {
        setActiveJobId(data.jobId);
      }
    },
    onError: (err: Error) => {
      toast.error(err?.message || "Failed to start draft analysis");
    },
  });

  // 2. Polling query for the active job
  const jobStatusQuery = useQuery<PolishDraftJobResponse | null, Error>({
    queryKey: ["polishDraftJob", activeJobId],
    queryFn: async (): Promise<PolishDraftJobResponse | null> => {
      if (!activeJobId) return null;
      const res = await writingAssistantService.getPolishDraftJob(activeJobId);
      if (res?.status === "failed") {
        toast.error(res?.error || "Draft analysis failed to complete.");
      }
      return res;
    },
    enabled: Boolean(activeJobId),
    refetchInterval: (query) => {
      const data = query.state.data as PolishDraftJobResponse | null | undefined;
      if (!data) return 2500;
      if (data.status === "completed" || data.status === "failed") {
        return false;
      }
      return 2500;
    },
  });

  // Unified loading state across the entire check lifecycle:
  // Starts when submitMutation begins and continues until the polling query returns 'completed' or 'failed'.
  const isPolishing = Boolean(
    submitMutation.isPending ||
      (activeJobId &&
        !submitMutation.isError &&
        !jobStatusQuery.isError &&
        jobStatusQuery.data?.status !== "completed" &&
        jobStatusQuery.data?.status !== "failed")
  );

  const result: PolishDraftResponse | null =
    activeJobId && jobStatusQuery.data?.status === "completed"
      ? (jobStatusQuery.data.result ?? null)
      : null;

  const error: Error | null =
    jobStatusQuery.data?.status === "failed"
      ? new Error(jobStatusQuery.data.error || "Draft analysis failed")
      : (submitMutation.error || jobStatusQuery.error || null);

  const polishDraft = useCallback(
    (payload: PolishDraftPayload) => {
      const trimmedQuestion = payload.question?.trim() || "";
      const trimmedDraft = payload.draft?.trim() || "";

      if (!trimmedQuestion && !trimmedDraft) {
        toast.info("Please provide a question and a draft answer before polishing.");
        return;
      }

      if (!trimmedQuestion) {
        toast.info("Question text is missing. Please select a question before polishing.");
        return;
      }

      if (!trimmedDraft) {
        toast.info("Please write or paste a draft answer before polishing.");
        return;
      }

      // Clear previous job immediately so old results don't linger
      setActiveJobId(null);
      submitMutation.mutate({
        question: trimmedQuestion,
        draft: trimmedDraft,
      });
    },
    [submitMutation]
  );

  const reset = useCallback(() => {
    setActiveJobId(null);
    submitMutation.reset();
  }, [submitMutation]);

  return {
    polishDraft,
    isPolishing,
    result,
    error,
    reset,
    activeJobId,
  };
};
