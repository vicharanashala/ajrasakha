import { useQuery } from '@tanstack/react-query';
import { testerLogService } from '../services/testerLogService';

export const useTesterLogHistory = (
    page = 1,
    limit = 20,
    startDate?: string,
    endDate?: string,
    dateField?: string,
) => {
    return useQuery({
        queryKey: ['tester-log-history', page, limit, startDate, endDate, dateField],
        queryFn: () => testerLogService.getMyHistory(page, limit, startDate, endDate, dateField),
        staleTime: 1000 * 60 * 2,
    });
};

export const useAllTesterLogEntries = (
    page = 1,
    limit = 20,
    testerId?: string,
    startDate?: string,
    endDate?: string,
    dateField?: string,
) => {
    return useQuery({
        queryKey: ['tester-log-all', page, limit, testerId, startDate, endDate, dateField],
        queryFn: () => testerLogService.getAllEntries(page, limit, testerId, startDate, endDate, dateField),
        staleTime: 1000 * 60 * 2,
    });
};
