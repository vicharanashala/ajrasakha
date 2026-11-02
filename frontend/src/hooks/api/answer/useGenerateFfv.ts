import { useState, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import { toast } from "sonner";

export interface GenerateFfvPayload {
  question: string;
  answer: string;
  domains?: string[];
}

export interface GenerateFfvVersion {
  angle: string;
  question: string;
  answer: string;
}

export interface GenerateFfvResponse {
  results: Array<{
    domain: string;
    versions: GenerateFfvVersion[];
  }>;
  total_versions: number;
}

export interface FfvJobResponse {
  job_id: string;
  status: "processing" | "completed" | "failed";
  results?: Array<{
    domain: string;
    versions: GenerateFfvVersion[];
  }>;
  total_versions?: number;
  error?: string;
}

export interface UseGenerateFfvReturn {
  generateFfv: (payload: GenerateFfvPayload) => void;
  resetFfv: () => void;
  isSubmitting: boolean;
  isGenerating: boolean;
  activeJobId: string | null;
  result: GenerateFfvResponse | null;
  error: Error | null;
}

const answerService = new AnswerService();

export const useGenerateFfv = (): UseGenerateFfvReturn => {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  // 1. Submit mutation to get a jobId
  const submitMutation = useMutation<{ job_id: string; status: string }, Error, GenerateFfvPayload>({
    mutationKey: ["submitFfv"],
    mutationFn: async (payload) => {
      const res = await answerService.submitFfv(payload);
      if (!res?.job_id) {
        throw new Error("No job ID returned from FFV service");
      }
      return res;
    },
    onSuccess: (data) => {
      setActiveJobId(data.job_id);
    },
    onError: (err: Error) => {
      toast.error(err?.message || "Failed to start FFV generation");
    },
  });

  // 2. Polling query for the active job
  const jobStatusQuery = useQuery<FfvJobResponse | null, Error>({
    queryKey: ["ffvJobStatus", activeJobId],
    queryFn: async (): Promise<FfvJobResponse | null> => {
      if (!activeJobId) return null;
      const res = await answerService.getFfv(activeJobId);
      if (res?.status === "failed") {
        toast.error(res?.error || "FFV generation failed to complete.");
      }
      return res;
    },
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const data = query.state.data as FfvJobResponse | null | undefined;
      if (!data) return 2500;
      if (data.status === "completed" || data.status === "failed") {
        return false;
      }
      return 2500;
    },
  });

  // Single unified loading state across the entire FFV generation lifecycle:
  // True from the exact moment submitMutation is called until the polling query returns 'completed' or 'failed'.
  const isGenerating: boolean = Boolean(
    submitMutation.isPending ||
      (activeJobId &&
        !submitMutation.isError &&
        !jobStatusQuery.isError &&
        jobStatusQuery.data?.status !== "completed" &&
        jobStatusQuery.data?.status !== "failed")
  );

  const result: GenerateFfvResponse | null =
    activeJobId && jobStatusQuery.data?.status === "completed" && jobStatusQuery.data?.results
      ? {
          results: jobStatusQuery.data.results,
          total_versions: jobStatusQuery.data.total_versions ?? 0,
        }
      : null;

  const error: Error | null =
    jobStatusQuery.data?.status === "failed"
      ? new Error(jobStatusQuery.data.error || "FFV generation failed")
      : (submitMutation.error || jobStatusQuery.error || null);

  const generateFfv = useCallback(
    (payload: GenerateFfvPayload) => {
      const trimmedQuestion = payload.question?.trim() || "";
      const trimmedAnswer = payload.answer?.trim() || "";

      if (!trimmedQuestion && !trimmedAnswer) {
        toast.info("Please provide a question and an answer before generating farmer-friendly versions.");
        return;
      }

      if (!trimmedQuestion) {
        toast.info("Question text is missing. Please select a valid question before generating FFVs.");
        return;
      }

      if (!trimmedAnswer) {
        toast.info("Please enter or generate an answer before generating farmer-friendly versions.");
        return;
      }

      // Clear previous activeJobId immediately so old results don't flash
      setActiveJobId(null);
      submitMutation.mutate({
        question: trimmedQuestion,
        answer: trimmedAnswer,
        domains: payload.domains,
      });
    },
    [submitMutation]
  );

  const resetFfv = useCallback(() => {
    setActiveJobId(null);
    submitMutation.reset();
  }, [submitMutation]);

  return {
    generateFfv,
    resetFfv,
    isSubmitting: submitMutation.isPending,
    isGenerating,
    activeJobId,
    result,
    error,
  };
};