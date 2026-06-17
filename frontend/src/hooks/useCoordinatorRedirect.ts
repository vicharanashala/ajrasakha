import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";

export const useCoordinatorRedirect = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: currentUser, isLoading } = useGetCurrentUser({
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    if (isCoordinatorRole(currentUser?.role)) {
      navigate({
        to: "/user/$userId",
        params: { userId: currentUser?._id || user.uid },
      });
    }
  }, [user, currentUser, navigate]);

  return {
    isCheckingCoordinator: !!user && isLoading,
    isCoordinator: isCoordinatorRole(currentUser?.role),
  };
};
