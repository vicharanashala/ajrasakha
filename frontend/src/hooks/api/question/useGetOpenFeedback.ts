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
    data: OpenFeedbackData[];
    totalCount: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

const questionService = new QuestionService();

// Mock data - 6 different feedbacks for testing
const mockFeedbacks: OpenFeedbackData[] = [
    {
        _id: { $oid: "6a67360ee10dd8cfed168645" },
        questionId: { $oid: "6a66f989aee7709bc6be9187" },
        userId: { name: "Mezz", email: "mezz@example.com" },
        answerId: { $oid: "6a671414aee7709bc6be96c9" },
        type: "thumbs_up",
        predefinedOption: "Correct and helpful",
        comment: "This answer was very helpful and solved my problem completely!",
        createdAt: { $date: "2026-07-27T10:42:22.434Z" },
        updatedAt: { $date: "2026-07-27T10:45:12.598Z" },
    },
    {
        _id: { $oid: "6a67360ee10dd8cfed168646" },
        questionId: { $oid: "6a66f989aee7709bc6be9187" },
        userId: { name: "Ravi Kumar", email: "ravi@example.com" },
        answerId: { $oid: "6a671414aee7709bc6be96c0" },
        type: "thumbs_down",
        predefinedOption: "Not correct and helpful",
        comment: "The information provided was incorrect. Please verify the details.",
        createdAt: { $date: "2026-07-28T11:30:00.000Z" },
        updatedAt: { $date: "2026-07-28T11:35:00.000Z" },
    },
    {
        _id: { $oid: "6a67360ee10dd8cfed168647" },
        questionId: { $oid: "6a66f989aee7709bc6be9187" },
        userId: { name: "Priya Singh", email: "priya@example.com" },
        answerId: { $oid: "6a671414aee7709bc6be96c1" },
        type: "thumbs_up",
        predefinedOption: "Partially correct",
        comment: "Good answer but could include more details about the dosage.",
        createdAt: { $date: "2026-07-29T09:15:00.000Z" },
        updatedAt: { $date: "2026-07-29T09:20:00.000Z" },
    },
    {
        _id: { $oid: "6a67360ee10dd8cfed168648" },
        questionId: { $oid: "6a66f989aee7709bc6be9187" },
        userId: { name: "Amit Sharma", email: "amit@example.com" },
        answerId: { $oid: "6a671414aee7709bc6be96c2" },
        type: "thumbs_down",
        predefinedOption: "Not helpful at all",
        comment: "This didn't solve my issue. I need more specific guidance.",
        createdAt: { $date: "2026-07-30T14:22:00.000Z" },
        updatedAt: { $date: "2026-07-30T14:25:00.000Z" },
    },
    {
        _id: { $oid: "6a67360ee10dd8cfed168649" },
        questionId: { $oid: "6a66f989aee7709bc6be9187" },
        userId: { name: "Sunita Devi", email: "sunita@example.com" },
        answerId: { $oid: "6a671414aee7709bc6be96c3" },
        type: "thumbs_up",
        predefinedOption: "Correct and helpful",
        comment: "Excellent explanation! Very clear and easy to understand.",
        createdAt: { $date: "2026-07-31T08:45:00.000Z" },
        updatedAt: { $date: "2026-07-31T08:50:00.000Z" },
    },
    {
        _id: { $oid: "6a67360ee10dd8cfed168650" },
        questionId: { $oid: "6a66f989aee7709bc6be9187" },
        userId: { name: "Vikram Patel", email: "vikram@example.com" },
        answerId: { $oid: "6a671414aee7709bc6be96c4" },
        type: "thumbs_up",
        predefinedOption: "Partially correct",
        comment: "Good effort but needs more examples for better understanding.",
        createdAt: { $date: "2026-08-01T16:10:00.000Z" },
        updatedAt: { $date: "2026-08-01T16:15:00.000Z" },
    },
];

export const useGetOpenFeedback = (questionId: string | null, page: number = 1, pageSize: number = 5) => {
    const { data, isLoading, error, refetch } = useQuery<
        OpenFeedbackResponse,
        Error
    >({
        queryKey: ["open_feedback", questionId, page, pageSize],
        queryFn: async () => {
            // TODO: Replace with actual API call when backend is ready
            // return await questionService.getOpenFeedback(questionId || '', page, pageSize);
            
            // Mock response for testing - paginated
            const startIndex = (page - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedFeedbacks = mockFeedbacks.slice(startIndex, endIndex);
            const totalPages = Math.ceil(mockFeedbacks.length / pageSize);
            
            return {
                data: paginatedFeedbacks,
                totalCount: mockFeedbacks.length,
                page,
                pageSize,
                totalPages,
            };
        },
        enabled: !!questionId,
    });

    return { data, isLoading, error, refetch };
};