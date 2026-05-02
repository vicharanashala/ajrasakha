import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { chemicalService, type ICreateChemicalRequest, type IChemicalResponse } from '@/hooks/services/chemicalService';

export const useCreateChemical = () => {
  const queryClient = useQueryClient();

  return useMutation<IChemicalResponse, Error, ICreateChemicalRequest>({
    mutationFn: (data) => chemicalService.createChemical(data),
    onSuccess: (response) => {
      toast.success(response.message);
      queryClient.invalidateQueries({ queryKey: ['chemicals'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || 'Failed to create chemical');
    },
  });
};
