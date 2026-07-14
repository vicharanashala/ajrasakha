import { createFileRoute } from "@tanstack/react-router";
import { WhatsAppHistoryPage } from "@/features/whatsappHistory/WhatsAppHistoryPage";
import { useAuthStore } from "@/stores/auth-store";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { useCoordinatorRedirect } from "@/hooks/useCoordinatorRedirect";
import { Breadcrumbs } from "@/components/Breadcrumbs";

export const Route = createFileRoute("/whatsapp-history")({
  validateSearch: z.object({
    threadId: z.string().optional(),
    date: z.string().optional(),
  }),
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
    <div className="flex-1 p-4 bg-muted/30">
      <Breadcrumbs />
      <WhatsAppHistoryPage />
    </div>
  );
}