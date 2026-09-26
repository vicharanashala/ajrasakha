import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { testerLogService } from '../services/testerLogService';
import type { ITesterLogEntry } from '../types';

type SubmitBody = Omit<ITesterLogEntry, '_id' | 'submittedByUserId' | 'submittedByEmail' | 'testerName' | 'createdAt' | 'updatedAt'>;

export const useTesterLogSubmit = () => {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (body: SubmitBody) => testerLogService.submitEntry(body),
        onSuccess: () => {
            toast.success('Test case submitted successfully!');
            queryClient.invalidateQueries({ queryKey: ['tester-log-history'] });
            queryClient.invalidateQueries({ queryKey: ['tester-log-next-test-id'] });
        },
        onError: (err: Error) => {
            toast.error(err.message ?? 'Failed to submit test case');
        },
    });
};
