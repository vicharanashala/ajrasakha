import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { chemicalService, type IUpdateChemicalRequest, type IChemicalResponse } from '@/hooks/services/chemicalService';

interface UpdateChemicalVariables {
  chemicalId: string;
  payload: IUpdateChemicalRequest;
}

export const useUpdateChemical = () => {
  const queryClient = useQueryClient();

  return useMutation<IChemicalResponse, Error, UpdateChemicalVariables>({
    mutationFn: ({ chemicalId, payload }) => chemicalService.updateChemical(chemicalId, payload),
    onSuccess: (response) => {
      toast.success(response.message);
      queryClient.invalidateQueries({ queryKey: ['chemicals'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to update chemical');
    },
  });
};
