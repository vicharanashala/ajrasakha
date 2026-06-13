import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { FarmerDashboard } from "@/features/chatbotDashboard/FarmerDashboard";

export const Route = createFileRoute("/farmers/$userId/dashboard")({
  validateSearch: z.object({
    source: z.enum(["annam", "whatsapp"]).optional(),
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { userId } = Route.useParams();
  const { source } = Route.useSearch();

  return <FarmerDashboard userId={userId} source={source} />;
}
