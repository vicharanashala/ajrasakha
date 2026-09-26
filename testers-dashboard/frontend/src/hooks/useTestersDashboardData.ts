import { useQuery } from '@tanstack/react-query';
import { testersDashboardService, type ITestersDashboardDataResponse } from '../services/testersDashboardService';

export const useTestersDashboardData = (source: 'sheet' | 'db' = 'sheet') => {
    return useQuery<ITestersDashboardDataResponse>({
        queryKey: ['testers-dashboard-data', source],
        queryFn: () => testersDashboardService.getData(source),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });
};