import { useQuery } from "@tanstack/react-query";
import {
  QuestionService,
  type PaeValidationQueueDetailsResponse,
} from "../../services/questionService";

const questionService = new QuestionService();

export type PaeQueuePaginationParams = {
  section?: 'waitingAuto' | 'waitingManual' | 'assigned';
  page?: number;
  limit?: number;
};

// Separate hook for fetching a single paginated section
export const useGetPaeValidationQueueSection = (
  enabled: boolean,
  section: 'waitingAuto' | 'waitingManual' | 'assigned',
  page: number = 1,
  limit: number = 50
) => {
  return useQuery<PaeValidationQueueDetailsResponse | null, Error>({
    queryKey: ["pae-validation-queue-section", section, page],
    queryFn: () => questionService.getPaeValidaitonQueueDetails({ section, page, limit }),
    enabled,
    staleTime: 30_000,
  });
};

export const useGetPaeValidationQueueDetails = (
  enabled: boolean,
  params?: PaeQueuePaginationParams
) => {
  return useQuery<PaeValidationQueueDetailsResponse | null, Error>({
    queryKey: ["pae-validation-queue-details", params?.section, params?.page],
    queryFn: () => questionService.getPaeValidaitonQueueDetails(params),
    enabled,
    staleTime: 30_000,
  });
};
