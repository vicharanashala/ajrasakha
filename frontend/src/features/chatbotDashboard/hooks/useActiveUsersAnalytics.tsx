import { useQuery } from "@tanstack/react-query";
import { ChatbotService } from "@/hooks/services/chatbotService";

const chatbotService = new ChatbotService();

export const useDailyActiveUsersTrend = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["daily_user_growth"],
    queryFn: () => {
      return chatbotService.getDailyActiveUsersTrend();
    },
    enabled,
  });
};

export const useMontlyActiveUsersTrend = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["monthly_user_growth"],
    queryFn: () => {
      return chatbotService.getMonthlyActiveUsersTrend();
    },
    enabled,
  });
};

export const useWeeklyActiveUsersTrend = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["weekly_user_growth"],
    queryFn: () => {
      return chatbotService.getWeeklyActiveUsersTrend();
    },
    enabled,
  });
};

export const useRetentionMetrics = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["retention_metrics"],
    queryFn: () => {
      return chatbotService.getRetentionMetrics();
    },
    enabled,
  });
};
