import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { PlaygroundPage } from "@/components/play-ground";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";

export const Route = createFileRoute("/home/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  return (
    <div
      className="min-h-screen w-full bg-gray-50 dark:bg-gray-900 p-4 relative flex flex-col bg-gradient-to-br from-green-50 via-emerald-50 to-teal-50 
        dark:from-green-950 dark:via-emerald-950 dark:to-teal-950"
    >
      <PlaygroundPage />
    </div>
  );
}
