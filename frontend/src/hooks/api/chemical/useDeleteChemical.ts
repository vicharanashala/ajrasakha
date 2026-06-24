import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { chemicalService } from '@/hooks/services/chemicalService';

export const useDeleteChemical = () => {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message: string }, Error, string>({
    mutationFn: (chemicalId) => chemicalService.deleteChemical(chemicalId),
    onSuccess: (response) => {
      toast.success(response.message);
      queryClient.invalidateQueries({ queryKey: ['chemicals'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to delete chemical');
    },
  });
};
