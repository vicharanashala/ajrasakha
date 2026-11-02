import { useQuery } from '@tanstack/react-query';
import { testerLogService } from '../services/testerLogService';

export const useTesterLogSummary = (
    startDate?: string,
    endDate?: string,
    dateField?: string,
    startTime?: string,
    endTime?: string,
) => {
    return useQuery({
        queryKey: ['tester-log-summary', startDate, endDate, dateField, startTime, endTime],
        queryFn: () => testerLogService.getMySummary(startDate, endDate, dateField, startTime, endTime),
        staleTime: 1000 * 60 * 2,
    });
};
