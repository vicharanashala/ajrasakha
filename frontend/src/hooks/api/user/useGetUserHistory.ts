import { useQuery } from "@tanstack/react-query";
import { UserService } from "@/hooks/services/userService";

export interface UserHistoryItem {
  _id?: string;
  userId?: string;
  from?: string;
  to?: string | null;
  role: string;
  status?: string;
  isBlocked?: boolean;
  special_task_force?: boolean;
}

export interface UserHistoryUserDetails {
  name?: string;
  email: string;
  firstName: string;
  lastName?: string;
  role?: string;
  status?: string;
  isBlocked?: boolean;
  special_task_force?: boolean;
}

export interface UserHistoryApiResponse {
  userDetails?: UserHistoryUserDetails | null;
  roleHistory: UserHistoryItem[];
}

const userService = new UserService();

export const useGetUserHistory = (userId?: string, from?: string, to?: string) => {
  return useQuery<UserHistoryApiResponse, Error>({
    queryKey: ["user-history", userId, from, to],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return { userDetails: null, roleHistory: [] };
      return userService.getUserHistory(userId, from, to);
    },
  });
};
