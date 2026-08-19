import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export interface FeedbackActionPayload {
    questionId: string;
    feedbackId: string;
    action: 'accept' | 'reject';
    reason: string;
    source: 'DATASET' | 'WEB_APPLICATION' | 'PAE_Validation';
}

export interface FeedbackActionResponse {
    success: boolean;
    message: string;
    data?: {
        feedbackId: string;
        action: string;
        reason: string;
        processedBy: string;
        processedAt: string;
    };
}

export const useFeedbackAction = () => {
    const mutation = useMutation<FeedbackActionResponse, Error, FeedbackActionPayload>({
        mutationFn: async ({ questionId, feedbackId, action, reason, source }: FeedbackActionPayload) => {
            const response = await questionService.handleFeedbackAction(questionId, feedbackId, action, reason, source);
            if (!response) {
                throw new Error("Failed to process feedback action");
            }
            return response;
        },
    });

    return {
        mutate: mutation.mutate,
        mutateAsync: mutation.mutateAsync,
        isPending: mutation.isPending,
        isError: mutation.isError,
        error: mutation.error,
        data: mutation.data,
        reset: mutation.reset,
    };
};