import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FarmerFeedbackApiService } from "../services/farmerFeedbackService";
import type { IFeedbackFilterState } from "../types";
import { toast } from "@/shared/components/toast";

export const FEEDBACK_QUERY_KEYS = {
  metrics: (filters: Partial<IFeedbackFilterState>) => ["farmer-feedback-metrics", filters],
  breakdowns: (filters: Partial<IFeedbackFilterState>) => ["farmer-feedback-breakdowns", filters],
  gdbTable: (filters: Partial<IFeedbackFilterState>) => ["farmer-feedback-gdb-table", filters],
  weeklyDigest: ["farmer-feedback-weekly-digest"],
};

export function useFarmerFeedbackMetrics(filters: Partial<IFeedbackFilterState>) {
  return useQuery({
    queryKey: FEEDBACK_QUERY_KEYS.metrics(filters),
    queryFn: () => FarmerFeedbackApiService.getMetrics(filters),
    staleTime: 30000,
    retry: 1,
  });
}

export function useFarmerFeedbackBreakdowns(filters: Partial<IFeedbackFilterState>) {
  return useQuery({
    queryKey: FEEDBACK_QUERY_KEYS.breakdowns(filters),
    queryFn: () => FarmerFeedbackApiService.getBreakdowns(filters),
    staleTime: 30000,
    retry: 1,
  });
}

export function useFarmerFeedbackGDBTable(filters: Partial<IFeedbackFilterState>) {
  return useQuery({
    queryKey: FEEDBACK_QUERY_KEYS.gdbTable(filters),
    queryFn: () => FarmerFeedbackApiService.getGDBSummaries(filters),
    staleTime: 30000,
    retry: 1,
  });
}

export function useFarmerFeedbackWeeklyDigest() {
  return useQuery({
    queryKey: FEEDBACK_QUERY_KEYS.weeklyDigest,
    queryFn: () => FarmerFeedbackApiService.getWeeklyDigest(),
    staleTime: 60000,
    retry: 1,
  });
}

export function useTriggerAutoFlagging() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threshold, minResponses }: { threshold?: number; minResponses?: number }) =>
      FarmerFeedbackApiService.triggerAutoFlagging(threshold, minResponses),
    onSuccess: (data) => {
      toast.success(data.message || "Auto-flagging pipeline completed successfully!");
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-gdb-table"] });
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-weekly-digest"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to run auto-flagging pipeline");
    },
  });
}

export function useManualFlagGDB() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ questionId, reason }: { questionId: string; reason?: string }) =>
      FarmerFeedbackApiService.flagGDBEntryManually(questionId, reason),
    onSuccess: () => {
      toast.success("GDB entry sent to reviewer queue for expert re-review!");
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-gdb-table"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to flag GDB entry");
    },
  });
}

export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      questionId: string;
      rating: 1 | 2;
      phoneNumber?: string;
      queryText?: string;
      deliveredAnswer?: string;
      domain?: string;
      crop?: string;
      state?: string;
      language?: string;
      feedbackText?: string;
    }) => FarmerFeedbackApiService.submitFeedback(payload),
    onSuccess: () => {
      toast.success("Feedback captured successfully!");
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-metrics"] });
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-breakdowns"] });
      queryClient.invalidateQueries({ queryKey: ["farmer-feedback-gdb-table"] });
    },
    onError: (err: any) => {
      toast.error(err?.message || "Failed to submit feedback");
    },
  });
}
