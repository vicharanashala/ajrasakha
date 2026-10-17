import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AnswerService,
  type AnswerCheckPayload,
  type AnswerCheckReport,
} from "@/hooks/services/answerService";
import { toast } from "sonner";

const answerService = new AnswerService();

export const useAnswerCheck = () => {
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
    onError: (err: any) => {
      toast.error(err?.message || "Failed to start quality checks");
    },
  });

  // 2. Polling query for active job
  const checkStatusQuery = useQuery({
    queryKey: ["answerCheckStatus", activeJobId],
    queryFn: async (): Promise<AnswerCheckReport | null> => {
      if (!activeJobId) return null;
      return await answerService.getAnswerCheck(activeJobId);
    },
    enabled: !!activeJobId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 3000;
      if (data.status === "completed" || data.status === "failed") {
        return false;
      }
      return 3000;
    },
  });

  const report = checkStatusQuery.data;
  const isChecking =
    submitMutation.isPending ||
    (Boolean(activeJobId) && report?.status === "processing");

  const startCheck = (payload: AnswerCheckPayload) => {
    submitMutation.mutate(payload);
  };

  const resetCheck = () => {
    setActiveJobId(null);
  };

  return {
    startCheck,
    resetCheck,
    isSubmitting: submitMutation.isPending,
    isChecking,
    activeJobId,
    report,
    error: submitMutation.error || checkStatusQuery.error,
  };
};
