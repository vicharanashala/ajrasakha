import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/coordinator/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser, isLoading } = useGetCurrentUser({
    enabled: !!user,
  });

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    if (currentUser && !isCoordinatorRole(currentUser.role)) {
      navigate({ to: "/home" });
    }
  }, [user, currentUser, navigate]);

  if (!user || isLoading || !isCoordinatorRole(currentUser?.role)) return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
        <h1 className="text-base font-semibold">Coordinator Dashboard</h1>
        <div className="flex items-center gap-2">
          <ThemeToggleCompact />
          <UserProfileActions />
        </div>
      </header>
    </div>
  );
}
