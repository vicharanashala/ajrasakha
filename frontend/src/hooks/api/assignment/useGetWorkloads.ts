import { useQuery } from '@tanstack/react-query';
import { AssignmentService } from '../../services/assignmentService';

const assignmentService = new AssignmentService();

export const useGetWorkloads = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ['assignment-workloads'],
    queryFn: () => assignmentService.getAllWorkloads(),
    refetchInterval: 30000,
    enabled,
  });
};
