import { useQuery } from '@tanstack/react-query';
import { AssignmentService } from '../../services/assignmentService';

const assignmentService = new AssignmentService();

export const useGetQueueEntries = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['assignment-queue-entries'],
    queryFn: () => assignmentService.getQueueEntries(),
    refetchInterval: 15000,
    enabled,
  });
};
