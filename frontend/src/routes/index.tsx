import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";
import { PublicDashboard } from "@/features/public-dashboard/PublicDashboard";

export const Route = createFileRoute("/")({
  component: App,
});

function App() {
  const { initAuthListener, user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    initAuthListener();
  }, [initAuthListener]);

  // Logged-in users go straight into the app; the public landing is for everyone else.
  // `user` is hydrated from persisted storage, so returning users redirect without a flash.
  useEffect(() => {
    if (user) navigate({ to: "/home" });
  }, [user, navigate]);

  if (user) return null;

  // Public, unauthenticated impact dashboard — shown to every visitor at the site root.
  return <PublicDashboard />;
}
