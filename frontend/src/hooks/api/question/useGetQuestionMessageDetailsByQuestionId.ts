import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";
import type { QuestionMessageDetailsResponse } from "@/types";


const questionService = new QuestionService();

export const useGetQuestionMessageDetailsByQuestionId = (questionId: string | null) => {
    const { data, isLoading, error, refetch } = useQuery<
        QuestionMessageDetailsResponse | null,
        Error
    >({
        queryKey: ["question_message_details", questionId],
        queryFn: async () => {
            if (!questionId) throw new Error("Question ID is required");
            return await questionService.getQuestionMessageDetailsByQuestionId(questionId);
        },
        enabled: !!questionId,
    });

    return { data, isLoading, error, refetch };
};