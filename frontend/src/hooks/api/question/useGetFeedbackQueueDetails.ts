import { useQuery } from "@tanstack/react-query";
import {
  QuestionService,
  type FeedbackQueueDetailsResponse,
} from "../../services/questionService";

const questionService = new QuestionService();

export const useGetFeedbackQueueDetails = (enabled: boolean) => {
  return useQuery<FeedbackQueueDetailsResponse | null, Error>({
    queryKey: ["feedback-queue-details"],
    queryFn: () => questionService.getFeedbackQueueDetails(),
    enabled,
    staleTime: 30_000,
  });
};
