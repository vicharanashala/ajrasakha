import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

export interface OpenFeedbackData {
    _id: { $oid: string };
    questionId: { $oid: string };
    userId: {
        name: string;
        email: string;
    };
    answerId: { $oid: string };
    type: "thumbs_up" | "thumbs_down";
    predefinedOption: string;
    comment: string;
    createdAt: { $date: string };
    updatedAt: { $date: string };
}

export interface OpenFeedbackResponse {
    data: OpenFeedbackData | null;
}

const questionService = new QuestionService();

export const useGetOpenFeedback = (questionId: string | null, feedbackId?: string | null) => {
    const { data, isLoading, error, refetch } = useQuery<
        OpenFeedbackResponse,
        Error
    >({
        queryKey: ["open_feedback", questionId, feedbackId],
        queryFn: async () => {
            // TODO: Replace with actual API call when backend is ready
            // return await questionService.getOpenFeedback(questionId || '', feedbackId || undefined);
            
            // Mock response for testing
            return {
                data: {
                    _id: { $oid: "6a67360ee10dd8cfed168645" },
                    questionId: { $oid: questionId || "6a66f989aee7709bc6be9187" },
                    userId: {
                        name: "Mezz",
                        email: "example@gmail.com",
                    },
                    answerId: { $oid: "6a671414aee7709bc6be96c9" },
                    type: "thumbs_up",
                    predefinedOption: "not Correct and helpful",
                    comment: "The answer was not perfect",
                    createdAt: { $date: "2026-07-27T10:42:22.434Z" },
                    updatedAt: { $date: "2026-07-27T10:45:12.598Z" },
                }
            };
        },
        enabled: !!questionId || !!feedbackId,
    });

    return { data, isLoading, error, refetch };
};
