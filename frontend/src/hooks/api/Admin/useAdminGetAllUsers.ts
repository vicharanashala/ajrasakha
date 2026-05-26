import { useQuery } from "@tanstack/react-query";
import { AdminUserService } from "@/hooks/services/adminService";

const adminUserService = new AdminUserService();

export const useAdminGetAllUsers = (
  page: number,
  limit: number,
  search: string,
  sort: string,
  filter: string,
  role: string,
  isBlocked: string,
  isVerified: string,
  isSTF: string,
  options: { enabled?: boolean } = {}
) => {
  return useQuery({
    queryKey: ["admin", page, limit, search, sort, filter, role, isBlocked, isVerified, isSTF],
    queryFn: () =>
      adminUserService.getAllUsers(page, limit, search, sort, filter, role, isBlocked, isVerified, isSTF),
    enabled: options.enabled ?? true,
  });
};