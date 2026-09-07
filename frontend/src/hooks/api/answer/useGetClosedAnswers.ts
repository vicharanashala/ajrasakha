import { useQuery } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import type { ClosedAnswersResponse } from "@/types";

const answerService = new AnswerService();

export const useGetClosedAnswers = (
  page: number,
  limit: number,
  search: string,
) => {
  return useQuery<ClosedAnswersResponse | null, Error>({
    queryKey: ["closed-answers", page, limit, search],
    queryFn: () => answerService.getClosedAnswers(page, limit, search),
  });
};
