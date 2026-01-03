import {  useQuery } from "@tanstack/react-query";
import { QuestionService } from "@/hooks/services/questionService";

const questionService = new QuestionService();

export const  useGetQuestionsAndLevel = (
  page: number,
  limit: number,
  search: string
) => {
  return useQuery({
    queryKey: ["questions_levels", page, limit,search],
    queryFn: async () => {
      const data = await questionService.GetQuestionsAndLevels(
        page,
        limit,
        search
      );
      return data;
    },
  });
};
