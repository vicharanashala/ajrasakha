import { useQuery } from "@tanstack/react-query";
import { ChatbotService } from "@/hooks/services/chatbotService";

const chatbotService = new ChatbotService();

export const useDailyActiveUsersTrend = (startDate: Date, endDate:Date, source: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [
      "daily_user_growth",
      startDate?.toISOString(),
      endDate?.toISOString(),
      source,
    ],
    queryFn: () => {
      return chatbotService.getDailyActiveUsersTrend(startDate.toString(), endDate.toString(), source);
    },
    enabled,
  });
};

export const useMontlyActiveUsersTrend = (startDate: Date, endDate:Date, source: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [
      "monthly_user_growth",
      startDate?.toISOString(),
      endDate?.toISOString(),
      source,
    ],
    queryFn: () => {
      return chatbotService.getMonthlyActiveUsersTrend(startDate.toString(), endDate.toString(), source);
    },
    enabled,
  });
};

export const useWeeklyActiveUsersTrend = (startDate: Date, endDate:Date, source: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [
      "weekly_user_growth",
      startDate?.toISOString(),
      endDate?.toISOString(),
      source,
    ],
    queryFn: () => {
      return chatbotService.getWeeklyActiveUsersTrend(startDate.toString(), endDate.toString(), source);
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
