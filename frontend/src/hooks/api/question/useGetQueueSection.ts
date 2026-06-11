import { useQuery, keepPreviousData } from "@tanstack/react-query";
import {
  QuestionService,
  type QueueSectionResponse,
} from "../../services/questionService";

const questionService = new QuestionService();

/** Fetch a single Queue-Details section page from the backend (server-side
 *  pagination — only the requested page of items crosses the wire). */
export const useGetQueueSection = (
  section: string,
  page: number,
  limit: number,
  enabled: boolean,
  startTime?: Date,
  endTime?: Date,
) => {
  return useQuery<QueueSectionResponse | null, Error>({
    queryKey: [
      "queue-section",
      section,
      page,
      limit,
      startTime?.toISOString(),
      endTime?.toISOString(),
    ],
    queryFn: () =>
      questionService.getQueueSection(section, page, limit, startTime, endTime),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
};
