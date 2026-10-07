import { useQuery } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import type { UserRole } from "@/types";

const userService = new UserService();

/** Fetches all users with the specified roles ({_id, name, email}) . */
export const useGetUsersByRole = (roles: UserRole[], enabled = true) => {
  return useQuery({
    queryKey: ["users-by-role"],
    queryFn: async () => {
      return await userService.getUsersByRole(roles);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
};
