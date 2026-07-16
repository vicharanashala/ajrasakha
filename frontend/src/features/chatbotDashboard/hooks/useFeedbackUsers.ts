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

export const useFeedbackLocation =({
  source,
  page,
  limit,
  sortBy,
  sortOrder,
  userType,
  rating,
  state,
  district,
  search,
  enabled = true,
}: {
  source?: string;
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: string;
  userType?: string;
  rating?: string;
  state?: string;
  district?: string; 
  search?: string;
  enabled?: boolean;
}) =>{
  return useQuery({
    queryKey: [
      "feedback-location",
      source,
      page,
      limit,
      sortBy,
      sortOrder,
      userType,
      rating,
      state,
      district,
      search,

    ],
    queryFn: () => {
      return chatbotService.getFeedbackByLocation({
        source,
        page,
        limit,
        sortBy,
        sortOrder,
        userType,
        rating,
        state,
        district,
        search,
      });
    },
    enabled,
  });
}

export const useClosedQuestionLocation = ({source, userType, state, district, enabled=true}:{source?: string, userType?: string, state?: string, district?: string, enabled?: boolean})=>{
  return useQuery({
    queryKey: [
      "closed-question-location",
      source,
      userType,
      state,
      district,
    ],
    queryFn: () => {
      return chatbotService.getClosedInLastTwoHoursByLocation({
        source,
        userType,
        state,
        district,
      });
    },
    enabled,
  });
}