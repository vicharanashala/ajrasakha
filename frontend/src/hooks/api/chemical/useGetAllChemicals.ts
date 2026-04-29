import { useQuery } from '@tanstack/react-query';
import { chemicalService, type IChemicalsPaginatedResponse } from '@/hooks/services/chemicalService';

export const useGetAllChemicals = (params?: {
  search?: string;
  sort?: 'newest' | 'oldest' | 'name_asc' | 'name_desc';
  page?: number;
  limit?: number;
}) => {
  return useQuery<IChemicalsPaginatedResponse>({
    queryKey: ['chemicals', params],
    queryFn: () => chemicalService.getAllChemicals(params),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
