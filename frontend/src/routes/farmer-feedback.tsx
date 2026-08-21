import { createFileRoute } from "@tanstack/react-router";
import { AjrasakhaHub } from "@/features/ajrasakhaHub/AjrasakhaHub";

export const Route = createFileRoute("/farmer-feedback")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AjrasakhaHub initialTab="farmer-feedback" />;
}


