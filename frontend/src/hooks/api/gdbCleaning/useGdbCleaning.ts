import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  gdbCleaningService,
  type IGdbDecisionRequest,
  type IGdbFlagEdit,
  type IGdbHistoryParams,
  type IGdbListParams,
  type IGdbRange,
} from "@/hooks/services/gdbCleaningService";
import type { IGdbCleaningItem, IGdbDraft, IGdbSource } from "@/features/gdb-cleaning/types";

const KEY = "gdb-cleaning";

export const useGdbList = (params: IGdbListParams) =>
  useQuery({
    queryKey: [KEY, "list", params],
    queryFn: () => gdbCleaningService.list(params),
    placeholderData: keepPreviousData,
  });

export const useGdbSummary = (range: IGdbRange = {}) =>
  useQuery({
    queryKey: [KEY, "summary", range],
    queryFn: () => gdbCleaningService.summary(range),
    placeholderData: keepPreviousData,
  });

export const useGdbHistory = (params: IGdbHistoryParams) =>
  useQuery({
    queryKey: [KEY, "history", params],
    queryFn: () => gdbCleaningService.history(params),
    placeholderData: keepPreviousData,
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
    queryClient.invalidateQueries({ queryKey: [KEY, "history"] });
    queryClient.invalidateQueries({ queryKey: [KEY, "filters"] });
  };
};

export const useSaveGdbCorrection = (answerId: string) => {
  const refresh = useRefreshAfterChange();
  return useMutation<IGdbCleaningItem, Error, { questionId: string; correctedAnswer: string }>({
    mutationFn: ({ questionId, correctedAnswer }) =>
      gdbCleaningService.saveCorrection(answerId, questionId, correctedAnswer),
    onSuccess: (saved) => {
      refresh(saved);
      toast.success("Correction saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to save the correction")),
  });
};

// the library draft saves nothing, so the list and the item stay as they are
export const useGdbLibraryDraft = (answerId: string) =>
  useMutation<IGdbDraft, Error, void>({
    mutationFn: () => gdbCleaningService.draftFromLibrary(answerId),
  });

export const useEditGdbFlag = (answerId: string) => {
  const refresh = useRefreshAfterChange();
  return useMutation<IGdbCleaningItem, Error, IGdbFlagEdit>({
    mutationFn: (edit) => gdbCleaningService.editFlag(answerId, edit),
    onSuccess: (saved) => {
      refresh(saved);
      toast.success("Flag updated");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to update the flag")),
  });
};

export const useEditGdbSources = (answerId: string) => {
  const refresh = useRefreshAfterChange();
  return useMutation<IGdbCleaningItem, Error, { questionId: string; sources: IGdbSource[] }>({
    mutationFn: ({ questionId, sources }) => gdbCleaningService.editSources(answerId, questionId, sources),
    onSuccess: (saved) => {
      refresh(saved);
      toast.success("Sources saved");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to save the sources")),
  });
};

export const usePushToGdb = (answerId: string) => {
  const refresh = useRefreshAfterChange();
  return useMutation<IGdbCleaningItem, Error, void>({
    mutationFn: () => gdbCleaningService.pushToGdb(answerId),
    onSuccess: (saved) => {
      refresh(saved);
      toast.success("Pushed to the golden database");
    },
    onError: (error) => toast.error(errorMessage(error, "Failed to push to the golden database")),
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
