import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chemicalService, type IUpdateChemicalRequest, type IChemicalResponse } from '@/hooks/services/chemicalService';
import { toast } from '@/shared/components/toast';

interface UpdateChemicalVariables {
  chemicalId: string;
  payload: IUpdateChemicalRequest;
}

export const useUpdateChemical = () => {
  const queryClient = useQueryClient();

  return useMutation<IChemicalResponse, Error, UpdateChemicalVariables,{toastId:string}>({
    onMutate: ()=>{
      const toastId = toast.loading('updating chemical...');
      return {toastId}
    },
    mutationFn: ({ chemicalId, payload }) => chemicalService.updateChemical(chemicalId, payload),
    onSuccess: (response,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.success(response.message);
      queryClient.invalidateQueries({ queryKey: ['chemicals'] });
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.error(error?.response?.data?.message || 'Failed to update chemical');
    },
  });
};
