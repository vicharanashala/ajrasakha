import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AnswerService,
  type AnswerCheckPayload,
  type AnswerCheckReport,
} from "@/hooks/services/answerService";
import { toast } from "sonner";

const answerService = new AnswerService();

export interface UseAnswerCheckReturn {
  startCheck: (payload: AnswerCheckPayload) => void;
  resetCheck: () => void;
  isSubmitting: boolean;
  isChecking: boolean;
  activeJobId: string | null;
  report: AnswerCheckReport | null;
  error: Error | null;
}

export const useAnswerCheck = (): UseAnswerCheckReturn => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // 1. Submit mutation
  const submitMutation = useMutation({
    mutationKey: ["submitAnswerCheck"],
    mutationFn: async (payload: AnswerCheckPayload) => {
      const res = await answerService.submitAnswerCheck(payload);
      if (!res?.job_id) {
        throw new Error("No job ID returned from verification service");
      }
      return res;
    },
    onSuccess: (data) => {
      setActiveJobId(data.job_id);
    },
    onError: (err: Error) => {
      toast.error(err?.message || "Failed to start quality checks");
    },
  });

  // 2. Polling query for active job
  const checkStatusQuery = useQuery<AnswerCheckReport | null, Error>({
    queryKey: ["answerCheckStatus", activeJobId],
    queryFn: async (): Promise<AnswerCheckReport | null> => {
      if (!activeJobId) return null;
      const res = await answerService.getAnswerCheck(activeJobId);
      if (res?.status === "failed") {
        toast.error("Quality checks failed to complete. Please try again.");
      }
      return res;
    },
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const data = query.state.data as AnswerCheckReport | null | undefined;
      if (!data) return 2500;
      if (data.status === "completed" || data.status === "failed") {
        return false;
      }
      return 2500;
    },
  });

  const report: AnswerCheckReport | null = activeJobId
    ? (checkStatusQuery.data ?? null)
    : null;

  // Single unified loading state across the entire check lifecycle:
  // True from the exact moment submitMutation is called until the polling query returns 'completed' or 'failed'.
  // This eliminates any intermediate gap or flickering between submission and status polling.
  const isChecking: boolean = Boolean(
    submitMutation.isPending ||
      (activeJobId &&
        !submitMutation.isError &&
        !checkStatusQuery.isError &&
        report?.status !== "completed" &&
        report?.status !== "failed")
  );

  const startCheck = useCallback(
    (payload: AnswerCheckPayload) => {
      // Clear previous activeJobId immediately so old results don't flash
      setActiveJobId(null);
      submitMutation.mutate(payload);
    },
    [submitMutation]
  );

  const resetCheck = useCallback(() => {
    setActiveJobId(null);
  }, []);

  return {
    startCheck,
    resetCheck,
    isSubmitting: submitMutation.isPending,
    isChecking,
    activeJobId,
    report,
    error: (submitMutation.error || checkStatusQuery.error || null) as Error | null,
  };
};
