import { AuthForm } from "@/components/auth-form";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/")({
  component: RouteComponent,
});

function RouteComponent() {
  return <AuthForm />;
}
