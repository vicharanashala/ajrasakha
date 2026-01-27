import { useQuery } from "@tanstack/react-query";
import { AdminUserService } from "@/hooks/services/adminService";

const adminUserService = new AdminUserService();

export const useAdminGetAllUsers = (
  page: number,
  limit: number,
  search: string,
  sort: string,
  filter: string,
  options: { enabled?: boolean } = {}
) => {
  return useQuery({
    queryKey: ["admin", page, limit, search, sort, filter],
    queryFn: () =>
      adminUserService.getAllUsers(page, limit, search, sort, filter),
    enabled: options.enabled ?? true,
  });
};
