import {useQuery } from "@tanstack/react-query";
import { AnswerService } from "../../services/answerService";
import { formatDateLocal } from "@/utils/formatDate";

const answerService = new AnswerService();
export const useGetSubmissions = (page: number, limit: number, dateRange: any,selectedHistoryId:any) => {
  return useQuery({
    queryKey: ["submissions", page, dateRange.start, dateRange.end,selectedHistoryId],
    // queryFn: () => answerService.getSubmissions(page, limit,{start:formatDateLocal(dateRange.start),end:formatDateLocal(dateRange.end)})
     queryFn: () => {
      const query: any = {};

      if (dateRange.start) query.start = formatDateLocal(dateRange.start);
      if (dateRange.end) query.end = formatDateLocal(dateRange.end);
      return answerService.getSubmissions(page, limit, query,selectedHistoryId);
    }
  });
};

