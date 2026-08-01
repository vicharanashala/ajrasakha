import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";

const answerService = new AnswerService();

/**
 * Gate keeper confirms a queue-duplicate question is a genuine duplicate.
 * Backend closes it (replicating the reference answer + firing the customer webhook)
 * if the reference question is already closed, otherwise moves it to
 * `duplicate_confirmed` to await the reference question's close.
 */
export const useConfirmDuplicate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["confirmDuplicate"],
    mutationFn: async (questionId: string) => {
      return await answerService.confirmDuplicate(questionId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["detailed_questions"] });
    },
  });
};
