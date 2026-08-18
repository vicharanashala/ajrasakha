import { useQuery } from "@tanstack/react-query";
import {
  QuestionService,
  type PaeValidationQueueDetailsResponse,
} from "../../services/questionService";

const questionService = new QuestionService();

export const useGetPaeValidationQueueDetails = (enabled: boolean) => {
  return useQuery<PaeValidationQueueDetailsResponse | null, Error>({
    queryKey: ["pae-validation-queue-details"],
    queryFn: () => questionService.getPaeValidaitonQueueDetails(),
    enabled,
    staleTime: 30_000,
  });
};
