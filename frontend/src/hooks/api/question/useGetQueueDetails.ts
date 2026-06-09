import { useQuery } from "@tanstack/react-query";
import {
  QuestionService,
  type QueueDetailsResponse,
} from "../../services/questionService";

const questionService = new QuestionService();

export const useGetQueueDetails = (enabled: boolean) => {
  return useQuery<QueueDetailsResponse | null, Error>({
    queryKey: ["queue-details"],
    queryFn: () => questionService.getQueueDetails(),
    enabled,
    staleTime: 30_000,
  });
};
