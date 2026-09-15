import { useQuery } from '@tanstack/react-query';
import { testerLogService } from '../services/testerLogService';

export const useTesterLogHistory = (page = 1, limit = 20) => {
    return useQuery({
        queryKey: ['tester-log-history', page, limit],
        queryFn: () => testerLogService.getMyHistory(page, limit),
        staleTime: 1000 * 60 * 2,
    });
};

export const useAllTesterLogEntries = (page = 1, limit = 20, testerId?: string) => {
    return useQuery({
        queryKey: ['tester-log-all', page, limit, testerId],
        queryFn: () => testerLogService.getAllEntries(page, limit, testerId),
        staleTime: 1000 * 60 * 2,
    });
};
