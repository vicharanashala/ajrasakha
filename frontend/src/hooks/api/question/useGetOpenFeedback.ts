import { useQuery } from "@tanstack/react-query";
import { QuestionService, type FeedbackResponse } from "../../services/questionService";

export type { FeedbackResponse };
export type { FeedbackData } from "../../services/questionService";

const questionService = new QuestionService();

export const useGetFeedbacks = (questionId: string | null, page: number = 1, pageSize: number = 5) => {
    const { data, isLoading, error, refetch } = useQuery<
        FeedbackResponse,
        Error
    >({
        queryKey: ["feedbacks", questionId, page, pageSize],
        queryFn: async () => {
            return await questionService.getFeedbacks(questionId || '', page, pageSize);
        },
        enabled: !!questionId,
    });

    return { data, isLoading, error, refetch };
};

export const useGetOpenFeedback = useGetFeedbacks;