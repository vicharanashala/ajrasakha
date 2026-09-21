import { useQuery } from '@tanstack/react-query';
import { testerLogService } from '../services/testerLogService';
import type { ITesterLogAdminFilters } from '../types';

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
    filters: ITesterLogAdminFilters = {},
) => {
    return useQuery({
        queryKey: ['tester-log-all', page, limit, filters],
        queryFn: () => testerLogService.getAllEntries(page, limit, filters),
        staleTime: 1000 * 60 * 2,
    });
};

export const useTesterOptions = () => {
    return useQuery({
        queryKey: ['tester-log-testers'],
        queryFn: () => testerLogService.getTesterOptions(),
        staleTime: 1000 * 60 * 5,
    });
};

export const useTesterLogSummary = (filters: ITesterLogAdminFilters = {}) => {
    return useQuery({
        queryKey: ['tester-log-summary', filters],
        queryFn: () => testerLogService.getSummary(filters),
        staleTime: 1000 * 60 * 2,
    });
};
