import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chemicalService } from '@/hooks/services/chemicalService';
import { toast } from '@/shared/components/toast';

export const useDeleteChemical = () => {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; message: string }, Error, string,{toastId:string}>({
    onMutate: () => {
      const toastId = toast.loading('deleting chemical...');
      return {toastId}
     },
    mutationFn: (chemicalId) => chemicalService.deleteChemical(chemicalId),
    onSuccess: (response,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.success(response.message);
      queryClient.invalidateQueries({ queryKey: ['chemicals'] });
    },
    onError: (error: any,_,context) => {
      if(context?.toastId)toast.dismiss(context.toastId);
      toast.error(error?.response?.data?.message || 'Failed to delete chemical');
    },
  });
};
