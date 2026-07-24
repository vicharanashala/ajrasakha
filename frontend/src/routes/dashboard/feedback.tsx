import { createFileRoute } from "@tanstack/react-router";
import { FarmerHelpfulnessDashboard } from "@/components/Feedback/FarmerHelpfulnessDashboard";
import { useAuthStore } from "@/stores/auth-store";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useCoordinatorRedirect } from "@/hooks/useCoordinatorRedirect";

export const Route = createFileRoute("/dashboard/feedback")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { isCheckingCoordinator, isCoordinator } = useCoordinatorRedirect();

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  if (isCheckingCoordinator || isCoordinator) return null;

  return (
    <div className="flex-1 p-4 bg-muted/30 min-h-screen">
      <FarmerHelpfulnessDashboard />
    </div>
  );
}
