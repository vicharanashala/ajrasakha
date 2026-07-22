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
  questionId?: string;
  messageId?: string;
  userId?: string;
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
  lifeCycleSummary: any;
}



export const useQuestionFilter = ({
  category,
  district,
  state,
  crop,
  crops,
  status,
  closedWithInTwohours,
  notificationType,
  period,
  questionType,
  page,
  limit,
  source,
  userType = "all",
  startDate,
  endDate,
  search = "",
  enabled = true,
  isPassed = false,
  tag,
  userId,
  manualSource,
  effectiveDate,
}: {
  category?: string;
  district?: string;
  state?: string
  crop?: string
  crops?: string[]
  status?: string
  closedWithInTwohours?: boolean
  notificationType?: string
  period?: string
  questionType: QueryCategoryQuestionType;
  page: number;
  limit: number;
  source: string;
  userType?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  enabled?: boolean;
  isPassed?: boolean;
  tag?: string
  userId?: string;
  manualSource?: "MANUAL" | "AGRI_EXPERT" | "OUTREACH";
  effectiveDate?: string;
}) => {
  
  return useQuery<QueryCategoryQuestionsResponse>({
  queryKey: [
    "get-question-filter",
    category,
    district,
    state,
    crop,
    crops?.join(","),
    status,
    closedWithInTwohours,
    notificationType,
    period,
    questionType,
    page,
    limit,
    source,
    userType,
    startDate,
    endDate,
    search,
    isPassed,
    tag,
    userId,
    manualSource,
    effectiveDate,
  ],
    queryFn: () =>
      chatbotService.getQuestionByFilters({
        category: category ?? "",
        district: district ?? "",
        state: state ?? "",
        crop: crop ?? "",
        crops: crops ?? [],
        status: status,
        closedWithInTwohours: closedWithInTwohours,
        notificationType: notificationType ?? "",
        period: period,
        questionType,
        page,
        limit,
        source,
        userType,
        startDate,
        endDate,
        search,
        isPassed,
        tag,
        userId,
        manualSource,
        effectiveDate,
      }),
    enabled: enabled && Boolean(category || district || crop || status || true),
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

export const useClosedAndNotifedData = (source: string, userType: string, startDate?: string, endDate?: string, enabled: boolean = true, userId?: string)=>{
  return useQuery({
    queryKey: ["closed-notified-data",
      source,
      userType,
      startDate,
      endDate,
      userId,
    ],
    queryFn: () => {
      return chatbotService.getClosedAndNotifedData(source, userType, startDate, endDate, userId);
    },
    // Removed placeholderData to ensure proper refetch
    staleTime: 1000 * 60 * 2, // 2 minutes
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

export const useQuestionLifeCycle = (questionId: string, enabled=true) => {
  return useQuery({
    queryKey: [
      "question-lifecycle",
      questionId,
    ],
    queryFn: () => {
      return chatbotService.getQuestionLifeCycle(questionId);
    },
    enabled,
  });
}

export const useActiveUserDetails = ({
  page,
  limit,
  source,
  userType,
  district,
  state,
  search,
  startDate,
  endDate,
  enabled = true
}:{
  page: number,
  limit: number,
  source: string,
  userType: string,
  district?: string,
  state?: string,
  search?: string
  startDate?: string,
  endDate?: string,
  enabled: boolean
})=>{
  return useQuery<any>({
    queryKey: [
      "get-active-user-details",
      page,
      limit,
      source,
      userType,
      district,
      state,
      search,
      startDate,
      endDate,
    ],
    queryFn: ()=>{
      return chatbotService.getActiveUserDetails({
        page,
        limit,
        source,
        userType,
        district: district ?? '',
        state: state ?? '',
        search: search ?? '',
        startDate,
        endDate
      })
    },
    enabled,
  })
}

export const useCoordinatorsDetails = ({
  page,
  limit,
  source,
  userType,
  district,
  state,
  search,
  enabled = true
}:{
  page: number,
  limit: number,
  source: string,
  userType: string,
  district?: string,
  state?: string,
  search?: string
  enabled: boolean
})=>{
  return useQuery<any>({
    queryKey: [
      "get-coordinators-details",
      page,
      limit,
      source,
      userType,
      district,
      state,
      search
    ],
    queryFn: ()=>{
      return chatbotService.getCoordinatorsDetails({
        page,
        limit,
        source,
        userType,
        district: district ?? '',
        state: state ?? '',
        search: search ?? ''
      })
    },
    enabled,
  })
}
export const useLifeCycleSummary = (  
  startDate?: string,
  endDate?: string,
  source?: string,
  status?: string,
  userType?: string,
  isPassed?: boolean,
  tag?: string,
  notificationType?: string,
  userId?: string,
  page?: number,
  limit?: number,
  manualSource?: "MANUAL" | "AGRI_EXPERT" | "OUTREACH",
  effectiveDate?: string,
  enabled=true) => {
  return useQuery({
    queryKey: [
      "lifecycle-summary",
      startDate,
      endDate,
      source,
      status,
      userType,
      isPassed,
      tag,
      notificationType,
      userId,
      page,
      limit,
      manualSource,
      effectiveDate,
    ],
    queryFn: () => {
      return chatbotService.getLifeCycleSummary(  
        startDate,
        endDate,
        source,
        status,
        userType,
        isPassed,
        tag,
        notificationType,
        userId,
        page,
        limit,
        manualSource,
        effectiveDate);
    },
    enabled,
    refetchOnWindowFocus: false,
  });
}

export const useTopQuestionInstances = ({
  questionId,
  source,
  userType = "all",
  startDate,
  endDate,
  page,
  limit,
  enabled = true,
}: {
  questionId?: string;
  source?: string;
  userType?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  limit?: number;
  enabled?: boolean;
}) => {
  const stringStartDate = startDate?.toISOString();
  const stringEndDate = endDate?.toISOString();
  
  return useQuery<QueryCategoryQuestionsResponse>({
    queryKey: [
      "top-question-instances",
      questionId,
      source,
      userType,
      stringStartDate,
      stringEndDate,
      page,
      limit,
    ],
    queryFn: () =>
      chatbotService.getTopQuestionInstances(questionId!, {
        source,
        userType,
        startTime: stringStartDate,
        endTime: stringEndDate,
        page,
        limit,
      }),
    enabled: enabled && Boolean(questionId),
  });
};

export const useActiveUserDetailsByQuestion = ({
  page,
  limit,
  source,
  userType,
  district,
  state,
  search,
  startDate,
  endDate,
  enabled = true
}:{
  page: number,
  limit: number,
  source: string,
  userType: string,
  district?: string,
  state?: string,
  search?: string
  startDate?: string,
  endDate?: string,
  enabled: boolean
})=>{
  return useQuery<any>({
    queryKey: [
      "get-active-user-details",
      page,
      limit,
      source,
      userType,
      district,
      state,
      search,
      startDate,
      endDate,
    ],
    queryFn: ()=>{
      return chatbotService.getActiveUsersDetailsByQuestions({
        page,
        limit,
        source,
        userType,
        district: district ?? '',
        state: state ?? '',
        search: search ?? '',
        startDate,
        endDate
      })
    },
    enabled,
  })
}
