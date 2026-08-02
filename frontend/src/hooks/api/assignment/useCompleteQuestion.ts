import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AssignmentService } from '../../services/assignmentService';

const assignmentService = new AssignmentService();

export const useCompleteQuestion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['completeQuestion'],
    mutationFn: async ({ questionId, expertId }: { questionId: string; expertId: string }) => {
      return await assignmentService.completeQuestion(questionId, expertId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assignment-workloads'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-queue'] });
      queryClient.invalidateQueries({ queryKey: ['assignment-queue-entries'] });
    },
  });
};
