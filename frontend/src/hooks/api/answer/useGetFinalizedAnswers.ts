import { useQuery } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import type { FinalizedAnswersResponse } from "@/types";

const answerService = new AnswerService();

export const useGetFinalizedAnswers = (user: string,date:string,status:string) => {
  const { data, isLoading, error ,refetch } = useQuery<FinalizedAnswersResponse | null, Error>(
    {
      queryKey: ["finalized-answers"],
      queryFn: async () => {
        return await answerService.getFinalizedAnswers(user,date,status);
      },
    }
  );

  return { data, isLoading, error,refetch};
};
