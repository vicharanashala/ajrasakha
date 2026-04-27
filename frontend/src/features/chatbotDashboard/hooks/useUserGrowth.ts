  import { useQuery } from "@tanstack/react-query";
import {ChatbotService} from "@/hooks/services/chatbotService";

const chatbotService = new ChatbotService();

export const useUserGrowth = (range: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["user_growth", range],
    queryFn: () => chatbotService.getUserGrowth(range),
    enabled,
  });
};