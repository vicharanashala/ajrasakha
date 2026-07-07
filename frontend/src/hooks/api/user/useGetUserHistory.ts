import { useQuery } from "@tanstack/react-query";
import { UserService } from "@/hooks/services/userService";

export interface UserHistoryItem {
  id?: string;
  timestamp?: string;
  createdAt?: string;
  date?: string;
  time?: string;
  title?: string;
  description?: string;
  details?: string;
  action?: string;
  role?: string;
  status?: string;
  blocked?: boolean;
  stf?: boolean;
  [key: string]: unknown;
}

export interface UserHistoryApiResponse {
  userDetails?: {
    name?: string;
    fullName?: string;
    userName?: string;
    email?: string;
    role?: string;
    userRole?: string;
    status?: string;
    userStatus?: string;
    blocked?: boolean;
    isBlocked?: boolean;
    stf?: boolean;
    isSTF?: boolean;
    [key: string]: unknown;
  };
  history?: UserHistoryItem[];
  data?: UserHistoryItem[];
  from?: string;
  to?: string;
  period?: { from?: string; to?: string };
  timePeriod?: { from?: string; to?: string };
  [key: string]: unknown;
}

const userService = new UserService();

export const useGetUserHistory = (userId?: string, from?: string, to?: string) => {
  return useQuery<UserHistoryApiResponse, Error>({
    queryKey: ["user-history", userId, from, to],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return { userDetails: {}, history: [] };
      return userService.getUserHistory(userId, from, to);
    },
  });
};
