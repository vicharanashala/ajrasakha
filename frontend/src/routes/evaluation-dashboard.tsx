import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { DashboardView } from "@/features/evaluation-dashboard/DashboardView";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";
import { useCoordinatorRedirect } from "@/hooks/useCoordinatorRedirect";

function EvaluationDashboardWrapper() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { isCheckingCoordinator, isCoordinator } = useCoordinatorRedirect();

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  if (isCheckingCoordinator || isCoordinator || !user) return null;

  return <DashboardView />;
}

export const Route = createFileRoute("/evaluation-dashboard")({
  component: EvaluationDashboardWrapper,
});
