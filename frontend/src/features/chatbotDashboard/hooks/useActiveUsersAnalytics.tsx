import { useQuery } from "@tanstack/react-query";
import { ChatbotService } from "@/hooks/services/chatbotService";

const chatbotService = new ChatbotService();

// export const useDailyActiveUsersTrend = ( source: string, userType: string,startDate?: Date, endDate?:Date, enabled: boolean = true) => {
//   return useQuery({
//     queryKey: [
//       "daily_user_growth",
//       startDate?.toISOString(),
//       endDate?.toISOString(),
//       source,
//       userType,
//     ],
//     queryFn: () => {
//       return chatbotService.getDailyActiveUsersTrend(source, userType, startDate?.toString(), endDate?.toString());
//     },
//     enabled,
//   });
// };

// export const useMontlyActiveUsersTrend = (source: string,  userType: string, startDate?: Date, endDate?:Date, enabled: boolean = true) => {
//   return useQuery({
//     queryKey: [
//       "monthly_user_growth",
//       startDate?.toISOString(),
//       endDate?.toISOString(),
//       source,
//       userType,
//     ],
//     queryFn: () => {
//       return chatbotService.getMonthlyActiveUsersTrend( userType, source, startDate?.toString(), endDate?.toString());
//     },
//     enabled,
//   });
// };

// export const useWeeklyActiveUsersTrend = ( source: string,  userType: string, startDate?: Date, endDate?:Date, enabled: boolean = true) => {
//   return useQuery({
//     queryKey: [
//       "weekly_user_growth",
//       startDate?.toISOString(),
//       endDate?.toISOString(),
//       source,
//       userType,
//     ],
//     queryFn: () => {
//       return chatbotService.getWeeklyActiveUsersTrend( userType, source, startDate?.toString(), endDate?.toString());
//     },
//     enabled,
//   });
// };

export const useRetentionMetrics = (
    source: string,
    userType: string,
    requestType: string,
    startDate?: string,
    endDate?: string,
    enabled: boolean = true) => {
  return useQuery({
    queryKey: ["retention_metrics",
      startDate,
      endDate,
      source,
      userType,
      requestType,
    ],
    queryFn: () => {
      return chatbotService.getRetentionMetrics(
        source,
        userType,
        requestType,
        startDate,
        endDate,
      );
    },
    enabled,
  });
};

export const useQueryCategories = (source: string, userType: string, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["query-categories",
      source,
      userType,
    ],
    queryFn: () => {
      return chatbotService.getQueryCategories(source, userType);
    },
    enabled,
  });
};

export type QueryCategoryQuestionType = "all" | "unique" | "duplicate";

export interface QueryCategoryQuestionEntry {
  questionId: string;
  question: string;
  status: string;
  questionType: "unique" | "duplicate";
  category: string;
  createdAt?: string;
  farmerName?: string;
  name?: string;
  email?: string;
  crop?: string;
  village?: string;
  block?: string;
  district?: string;
  state?: string;
}

export interface QueryCategoryQuestionsResponse {
  questions: QueryCategoryQuestionEntry[];
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export const useQueryCategoryQuestions = ({
  category,
  questionType,
  page,
  limit,
  source,
  userType = "all",
  enabled = true,
}: {
  category?: string;
  questionType: QueryCategoryQuestionType;
  page: number;
  limit: number;
  source: string;
  userType?: string;
  enabled?: boolean;
}) => {
  return useQuery<QueryCategoryQuestionsResponse>({
    queryKey: [
      "query-category-questions",
      category,
      questionType,
      page,
      limit,
      source,
      userType,
    ],
    queryFn: () =>
      chatbotService.getQueryCategoryQuestions({
        category: category ?? "",
        questionType,
        page,
        limit,
        source,
        userType,
      }),
    enabled: enabled && Boolean(category),
  });
};

export const useInactiveWhatsappUsers = (inactiveUsersPage: number, enabled: boolean = true) => {
  return useQuery({
    queryKey: ["whatsapp-inactive-users",
      inactiveUsersPage,
    ],
    queryFn: () => {
      return chatbotService.getInactiveWhatsappUsers(inactiveUsersPage);
    },
    enabled,
  });
};


export const useUniqueWhatsappUsers = (enabled: boolean = true) => {
  return useQuery({
    queryKey: ["whatsapp-unique-users",
    ],
    queryFn: () => {
      return chatbotService.getUniqueWhatsappUsers();
    },
    enabled,
  });
};

export const useAllWhatsappUsers = () => {
  return useQuery({
    queryKey: ["whatsapp-all-users"],
    queryFn: () => {
      return chatbotService.getAllWhatsappUsers();
    },
  });
};

export const useClosedAndNotifedData = (source: string, startDate?: string, endDate?: string, enabled: boolean = true)=>{
  return useQuery({
    queryKey: ["closed-notified-data",
      source,
      startDate,
      endDate,
    ],
    queryFn: () => {
      return chatbotService.getClosedAndNotifedData(source, startDate, endDate);
    },
    placeholderData: (previousData) => previousData,
    enabled,
  });
}

export const useMonthlyChurnRate = (source: string, userType: string, enabled: boolean = true)=>{
  return useQuery({
    queryKey: ["monthly-churn-rate",
      source,
      userType,
    ],
    queryFn: () => {
      return chatbotService.getMonthlyChurnRate(source, userType);
    },
    enabled,
  });
}

export const useActiveUsersTrend = ( source: string, userType: string, requestType: string, startDate?: Date, endDate?:Date, enabled: boolean = true) => {
  return useQuery({
    queryKey: [
      "active_user_trend",
      startDate?.toISOString(),
      endDate?.toISOString(),
      source,
      userType,
      requestType,
    ],
    queryFn: () => {
      return chatbotService.getActiveUsersTrend(source, userType, requestType, startDate?.toString(), endDate?.toString());
    },
    enabled,
  });
};
