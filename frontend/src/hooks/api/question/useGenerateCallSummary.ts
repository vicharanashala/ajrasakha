import { useMutation } from "@tanstack/react-query";
import { QuestionService } from "../../services/questionService";

const questionService = new QuestionService();

export const useGenerateCallSummary = () => {
  return useMutation({
    mutationKey: ["generateCallSummary"],
    mutationFn: async (
      transcript: string
    ): Promise<{ extracted_question: string, extracted_state: string, extracted_crop: string } | null> => {
      return await questionService.generateCallSummary(transcript);
    },
  });
};
