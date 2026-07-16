import { useQuery } from "@tanstack/react-query";
import { ChatbotService } from "@/hooks/services/chatbotService";

const chatbotService = new ChatbotService();

export const useFeedbackUsers = ({
  page,
  limit,
  search,
  sortBy,
  sortOrder,
  rating,
  tag,
  source,
  userType,
  enabled = true,
}: {
  page: number;
  limit: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  rating?: string;
  tag?: string;
  source?: string;
  userType?: string;
  enabled?: boolean;
}) => {
  return useQuery({
    queryKey: [
      "feedback-users",
      page,
      limit,
      search,
      sortBy,
      sortOrder,
      rating,
      tag,
      source,
      userType,
    ],
    queryFn: () => {
      return chatbotService.getFeedbackUsers({
        page,
        limit,
        search,
        sortBy,
        sortOrder,
        rating,
        tag,
        source,
        userType,
      });
    },
    enabled,
  });
};
