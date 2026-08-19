import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { QuestionFeedbackResponse } from "@/types";

const questionService = new QuestionService();

export const useGetQuestionFeedback = (questionId: string | null) => {
    const { data, isLoading, error, refetch } = useQuery<
        QuestionFeedbackResponse | null,
        Error
    >({
        queryKey: ["question_feedback", questionId],
        queryFn: async () => {
            if (!questionId) throw new Error("Question ID is required");
            return await questionService.getQuestionFeedbackByQuestionId(questionId);
        },
        enabled: !!questionId,
    });

    return { data, isLoading, error, refetch };
};
