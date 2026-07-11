import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { DashboardContentEditor } from "@/features/public-dashboard/admin/DashboardContentEditor";

export const Route = createFileRoute("/dashboard-editor/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser, isLoading } = useGetCurrentUser({ enabled: !!user });

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  if (!user || isLoading) return null;

  const role = currentUser?.role;
  if (role !== "admin" && role !== "moderator") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-muted-foreground">
        You don't have permission to edit dashboard content.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardContentEditor />
    </div>
  );
}
