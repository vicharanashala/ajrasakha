import { useQuery } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export const useGetReallocationPreview = (type: string, enabled: boolean = false) => {
  return useQuery({
    queryKey: ["reallocationPreview", type],
    queryFn: () => questionService.getReallocationPreview(type),
    enabled: enabled && !!type,
  });
};
