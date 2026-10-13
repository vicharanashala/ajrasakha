import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  gdbCleaningService,
  type IGdbDecisionRequest,
  type IGdbListParams,
} from "@/hooks/services/gdbCleaningService";
import type { IGdbCleaningItem } from "@/features/gdb-cleaning/types";

const KEY = "gdb-cleaning";

export const useGdbList = (params: IGdbListParams) =>
  useQuery({
    queryKey: [KEY, "list", params],
    queryFn: () => gdbCleaningService.list(params),
    placeholderData: keepPreviousData,
  });

export const useGdbSummary = () =>
  useQuery({
    queryKey: [KEY, "summary"],
    queryFn: () => gdbCleaningService.summary(),
  });

export const useGdbFilterOptions = () =>
  useQuery({
    queryKey: [KEY, "filters"],
    queryFn: () => gdbCleaningService.filters(),
    staleTime: 1000 * 60 * 5,
  });

export const useGdbItem = (answerId: string) =>
  useQuery({
    queryKey: [KEY, "item", answerId],
    queryFn: () => gdbCleaningService.get(answerId),
  });

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message || error?.message || fallback;

// after a change the open answer is replaced with the saved one,
// and the list and the counts are loaded again
const useRefreshAfterChange = () => {
  const queryClient = useQueryClient();
  return (saved: IGdbCleaningItem) => {
    queryClient.setQueryData([KEY, "item", saved.id], saved);
    queryClient.invalidateQueries({ queryKey: [KEY, "list"] });
    queryClient.invalidateQueries({ queryKey: [KEY, "summary"] });
    queryClient.invalidateQueries({ queryKey: [KEY, "filters"] });
  };
};

export const useSaveGdbCorrection = (answerId: string) => {
  const refresh = useRefreshAfterChange();
  return useMutation<IGdbCleaningItem, Error, string>({
    mutationFn: (correctedAnswer) => gdbCleaningService.saveCorrection(answerId, correctedAnswer),
    onSuccess: (saved) => {
      refresh(saved);
      toast.success("Correction saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to save the correction")),
  });
};

export const useGdbDecision = (answerId: string) => {
  const refresh = useRefreshAfterChange();
  return useMutation<IGdbCleaningItem, Error, IGdbDecisionRequest>({
    mutationFn: (decision) => gdbCleaningService.decide(answerId, decision),
    onSuccess: (saved, decision) => {
      refresh(saved);
      toast.success(decision.action === "accept" ? "Correction accepted" : "Flags dismissed");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to save the decision")),
  });
};
