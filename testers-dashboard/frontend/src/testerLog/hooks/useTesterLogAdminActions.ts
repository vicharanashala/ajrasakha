import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { testerLogService } from '../services/testerLogService';
import type { ITesterLogEntry } from '../types';

// Every view that reads tester_test_cases - the Tester Data table and its
// summary cards, the Tester filter list (a delete can remove a tester's only
// entry), the Summary tab, the testers' own history, and the Analytics tab's
// DB source.
function refreshTesterLogViews(queryClient: QueryClient) {
    for (const key of [
        'tester-log-all',
        'tester-log-summary',
        'tester-log-testers',
        'tester-log-question-type-summary',
        'tester-log-history',
        'testers-dashboard-data',
        'testers-dashboard-summary',
    ]) {
        queryClient.invalidateQueries({ queryKey: [key] });
    }
}

export const useUpdateTesterLogEntry = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, changes }: { id: string; changes: Partial<ITesterLogEntry> }) =>
            testerLogService.updateEntry(id, changes),
        onSuccess: () => {
            toast.success('Tester entry updated');
            refreshTesterLogViews(queryClient);
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to update tester entry');
        },
    });
};

export const useDeleteTesterLogEntry = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: string) => testerLogService.deleteEntry(id),
        onSuccess: () => {
            toast.success('Tester entry deleted');
            refreshTesterLogViews(queryClient);
        },
        onError: (err: Error) => {
            toast.error(err.message || 'Failed to delete tester entry');
        },
    });
};
