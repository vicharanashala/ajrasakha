import { useQuery } from "@tanstack/react-query";
import {
  QuestionService,
  type QueueDetailsResponse,
} from "../../services/questionService";

const questionService = new QuestionService();

export const useGetQueueDetails = (
  enabled: boolean,
  startTime?: Date,
  endTime?: Date
) => {
  return useQuery<QueueDetailsResponse | null, Error>({
    queryKey: ["queue-details", startTime?.toISOString(), endTime?.toISOString()],
    queryFn: () => questionService.getQueueDetails(startTime, endTime),
    enabled,
    staleTime: 30_000,
  });
};
