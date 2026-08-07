import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { SavedAnswerService, type SavedAnswerItem } from "../../services/savedAnswerService";
import { toast } from "sonner";

const savedAnswerService = new SavedAnswerService();

export const useSavedAnswers = () =>
  useQuery<SavedAnswerItem[] | null>({
    queryKey: ["saved-answers"],
    queryFn: () => savedAnswerService.list(),
  });

export const useSaveAnswer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ answerId, note }: { answerId: string; note?: string }) =>
      savedAnswerService.save(answerId, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-answers"] });
      toast.success("Answer saved for reuse");
    },
    onError: (error: Error) => toast.error(error.message || "Failed to save answer"),
  });
};

export const useRemoveSavedAnswer = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => savedAnswerService.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-answers"] }),
  });
};