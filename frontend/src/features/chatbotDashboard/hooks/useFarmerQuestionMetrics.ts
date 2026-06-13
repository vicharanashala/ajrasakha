import { useQuery } from "@tanstack/react-query";
import { env } from "@/config/env";
import { apiFetch } from "@/hooks/api/api-fetch";

export interface FarmerQuestionMetrics {
  totalQuestionsAsked: number;
  questionsClosed: number;
  questionsInReview: number;
  questionsPending: number;
  duplicateQuestions: number;
  nonDuplicateQuestions: number;
  questionsClosedWithin2Hours: number;
  carryForwardQuestions: number;
  questionsAwaitingReview: number;
  statusBreakdown: Record<string, number>;
}

const emptyMetrics: FarmerQuestionMetrics = {
  totalQuestionsAsked: 0,
  questionsClosed: 0,
  questionsInReview: 0,
  questionsPending: 0,
  duplicateQuestions: 0,
  nonDuplicateQuestions: 0,
  questionsClosedWithin2Hours: 0,
  carryForwardQuestions: 0,
  questionsAwaitingReview: 0,
  statusBreakdown: {},
};

export function useFarmerQuestionMetrics(
  userId: string,
  source: "annam" | "whatsapp" = "annam",
  userType = "all",
  enabled = true,
) {
  return useQuery<FarmerQuestionMetrics, Error>({
    queryKey: ["farmer-question-metrics", userId, source, userType],
    staleTime: 30 * 1000,
    enabled,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("source", source);
      params.set("userType", userType);

      const result = await apiFetch<FarmerQuestionMetrics>(
        `${env.apiBaseUrl()}/analytics/farmers/${userId}/question-metrics?${params.toString()}`,
      );

      return result ?? emptyMetrics;
    },
  });
}
