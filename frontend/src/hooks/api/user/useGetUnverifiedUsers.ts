import { useQuery, type UseQueryOptions } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import type { IUnverifiedUser } from "@/types";

const userService = new UserService();

interface UnverifiedUsersParams {
  page?: number;
  limit?: number;
  search?: string;
}

export const useGetUnverifiedUsers = (
  params: UnverifiedUsersParams = {},
  options?: UseQueryOptions<{
    users: IUnverifiedUser[];
    totalUsers: number;
    totalPages: number;
  } | null>
) => {
  const { page = 1, limit = 10, search = "" } = params;

  return useQuery({
    queryKey: ["unverified_users", { page, limit, search }],
    queryFn: async () => {
      return await userService.getUnverifiedUsers(page, limit, search);
    },
    ...options,
  });
};
