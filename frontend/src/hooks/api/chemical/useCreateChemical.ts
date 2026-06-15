import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chemicalService, type ICreateChemicalRequest, type IChemicalResponse } from '@/hooks/services/chemicalService';
import { toast } from '@/shared/components/toast';

export const useCreateChemical = () => {
  const queryClient = useQueryClient();

  return useMutation<IChemicalResponse, Error, ICreateChemicalRequest,{toastId:string}>({
    onMutate: () => {
      const toastId = toast.loading('creating chemical...')
      return {toastId}
    },
    mutationFn: (data) => chemicalService.createChemical(data),
    onSuccess: (response,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.success(response.message);
      queryClient.invalidateQueries({ queryKey: ['chemicals'] });
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.error(error?.response?.data?.message || 'Failed to create chemical');
    },
  });
};
