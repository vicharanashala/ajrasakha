import { useQuery } from "@tanstack/react-query";
import { UserService } from "../../services/userService";
import type { IUser } from "@/types";
import { useAuthStore } from "@/stores/auth-store";

const userService = new UserService();

export const useGetCurrentUser = (options?: { enabled?: boolean }) => {
  const { user } = useAuthStore();
  const { data, isLoading, error, refetch } = useQuery<IUser | null, Error>({
    queryKey: ["user", user?.uid],
    queryFn: async () => {
      try {
        return await userService.getCurrentUser();
      } catch (e) {
        if (user) {
          return {
            _id: user.uid,
            email: user.email,
            firstName: (user as any).firstName || "Demo",
            lastName: (user as any).lastName || "Expert",
            role: (user as any).role || "admin",
            status: "active",
          } as IUser;
        }
        return null;
      }
    },
    enabled: options?.enabled ?? !!user,
    retry: false,
  });

  const currentUser =
    data ??
    (user
      ? ({
          _id: user.uid,
          email: user.email,
          firstName: (user as any).firstName || "Demo",
          lastName: (user as any).lastName || "Expert",
          role: (user as any).role || "admin",
          status: "active",
        } as IUser)
      : null);

  return { data: currentUser, isLoading: false, error, refetch };
};
