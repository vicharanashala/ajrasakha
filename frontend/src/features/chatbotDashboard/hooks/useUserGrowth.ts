import { useQuery } from "@tanstack/react-query";
import { ChatbotService } from "@/hooks/services/chatbotService";

const chatbotService = new ChatbotService();

export const useUserGrowth = (
  source: string,
  userType: string,
  startDate?: Date,
  endDate?: Date,
  enabled: boolean = true
) => {
  const startISO = startDate?.toISOString();
  const endISO = endDate
    ? new Date(endDate.getTime() + 24 * 60 * 60 * 1000 - 1).toISOString()
    : undefined;

  return useQuery({
    queryKey: ["user_growth", source, userType, startISO, endISO],
    queryFn: () => {
      if (startISO && endISO) {
        return chatbotService.getUserGrowthByDateRange(source, userType, startISO, endISO);
      }

      return chatbotService.getUserGrowth(source, userType, 3650);
    },
    enabled,
  });
};
