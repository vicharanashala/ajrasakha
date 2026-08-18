// import { AuthForm } from "@/components/auth-form";
import { AuthForm } from "@/features/auth/components/AuthForm";
import { useAuthStore } from "@/stores/auth-store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";

export const Route = createFileRoute("/auth/")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: currentUser } = useGetCurrentUser({ enabled: !!user });
  const redirectedRef = useRef(false);

  useEffect(() => {
    if (!user || redirectedRef.current) return;
    redirectedRef.current = true;
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
