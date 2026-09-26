import { useQuery } from '@tanstack/react-query';
import { testerLogService } from '../services/testerLogService';

export const useTesterLogSummary = (
    startDate?: string,
    endDate?: string,
    dateField?: string,
) => {
    return useQuery({
        queryKey: ['tester-log-summary', startDate, endDate, dateField],
        queryFn: () => testerLogService.getMySummary(startDate, endDate, dateField),
        staleTime: 1000 * 60 * 2,
    });
};
