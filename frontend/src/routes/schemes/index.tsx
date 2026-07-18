import { createFileRoute } from "@tanstack/react-router";
import { GovtSchemesPage } from "@/features/govtSchemes/GovtSchemesPage";

export const Route = createFileRoute("/schemes/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <GovtSchemesPage />;
}
