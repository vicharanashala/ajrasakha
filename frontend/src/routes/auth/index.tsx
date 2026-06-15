// import { AuthForm } from "@/components/auth-form";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { useAuthStore } from "@/stores/auth-store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";

export const Route = createFileRoute("/auth/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: currentUser } = useGetCurrentUser({ enabled: !!user });

  useEffect(() => {
    if (!user) return;
    if (isCoordinatorRole(currentUser?.role)) {
      navigate({
        to: "/user/$userId",
        params: { userId: currentUser?._id || user.uid },
      });
    } else {
      navigate({ to: "/home" });
    }
  }, [user, currentUser, navigate]);

  return <AuthForm />;
}
