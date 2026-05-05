import { createFileRoute } from "@tanstack/react-router";
import { WhatsAppHistoryPage } from "@/features/whatsappHistory/WhatsAppHistoryPage";
import { useAuthStore } from "@/stores/auth-store";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/whatsapp-history")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  return (
    <div className="flex-1 p-4 bg-muted/30">
      <WhatsAppHistoryPage />
    </div>
  );
}
