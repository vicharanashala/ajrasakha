import { useQuery } from '@tanstack/react-query';
import { testersDashboardService, type ITestersDashboardDataResponse } from '@/hooks/services/testersDashboardService';

export const useTestersDashboardData = () => {
    return useQuery<ITestersDashboardDataResponse>({
        queryKey: ['testers-dashboard-data'],
        queryFn: () => testersDashboardService.getData(),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};