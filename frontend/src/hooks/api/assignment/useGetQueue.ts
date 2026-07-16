import { useQuery } from '@tanstack/react-query';
import { AssignmentService } from '../../services/assignmentService';

const assignmentService = new AssignmentService();

export const useGetQueue = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['assignment-queue'],
    queryFn: () => assignmentService.getQueueLengths(),
    refetchInterval: 15000,
    enabled,
  });
};
