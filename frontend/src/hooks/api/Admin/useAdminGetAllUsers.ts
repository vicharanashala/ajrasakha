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
  isTMU: string,
  options: { enabled?: boolean } = {}
) => {
  return useQuery({
    queryKey: ["admin", page, limit, search, sort, filter, role, isBlocked, isVerified, isSTF, isTMU],
    queryFn: () =>
      adminUserService.getAllUsers(page, limit, search, sort, filter, role, isBlocked, isVerified, isSTF, isTMU),
    enabled: options.enabled ?? true,
  });
};