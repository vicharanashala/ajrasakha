import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { GdbCoverageDashboard } from "@/features/gdb-coverage/GdbCoverageDashboard";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { useAuthStore } from "@/stores/auth-store";

export const Route = createFileRoute("/gdb-coverage/")({
  component: GdbCoverageRoute,
});

function GdbCoverageRoute() {
  const { user } = useAuthStore();
  const { data: currentUser, isLoading } = useGetCurrentUser({});
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
    } else if (currentUser && currentUser.role !== "admin") {
      navigate({ to: "/home" });
    }
  }, [currentUser, navigate, user]);

  if (!user || isLoading || currentUser?.role !== "admin") return null;

  return <GdbCoverageDashboard />;
}
