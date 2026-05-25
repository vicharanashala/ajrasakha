import { useQuery } from "@tanstack/react-query";
import { ChatbotService } from "@/hooks/services/chatbotService";

const chatbotService = new ChatbotService();

export const useDailyActiveUsersTrend = (startDate: Date, endDate:Date, source: string, userType: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [
      "daily_user_growth",
      startDate?.toISOString(),
      endDate?.toISOString(),
      source,
      userType,
    ],
    queryFn: () => {
      return chatbotService.getDailyActiveUsersTrend(startDate.toString(), endDate.toString(), userType, source);
    },
    enabled,
  });
};

export const useMontlyActiveUsersTrend = (startDate: Date, endDate:Date, source: string,  userType: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [
      "monthly_user_growth",
      startDate?.toISOString(),
      endDate?.toISOString(),
      source,
      userType,
    ],
    queryFn: () => {
      return chatbotService.getMonthlyActiveUsersTrend(startDate.toString(), endDate.toString(), userType, source);
    },
    enabled,
  });
};

export const useWeeklyActiveUsersTrend = (startDate: Date, endDate:Date, source: string,  userType: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: [
      "weekly_user_growth",
      startDate?.toISOString(),
      endDate?.toISOString(),
      source,
      userType,
    ],
    queryFn: () => {
      return chatbotService.getWeeklyActiveUsersTrend(startDate.toString(), endDate.toString(), userType, source);
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

export const useQueryCategories = (source: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["query-categories",
      source
    ],
    queryFn: () => {
      return chatbotService.getQueryCategories(source);
    },
    enabled,
  });
};

export const useInactiveWhatsappUsers = (inactiveUsersPage: number) => {
  return useQuery({
    queryKey: ["whatsapp-inactive-users",
      inactiveUsersPage,
    ],
    queryFn: () => {
      return chatbotService.getInactiveWhatsappUsers(inactiveUsersPage);
    },
  });
};

