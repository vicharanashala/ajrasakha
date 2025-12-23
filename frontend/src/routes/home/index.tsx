import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlaygroundPage } from "@/components/play-ground";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";
import { z } from "zod";
export const Route = createFileRoute("/home/")({
  validateSearch: z.object({
    question: z.string().optional(),
    request: z.string().optional(),
    comment: z.string().optional(),
    history:z.string().optional(),
    expertId:z.string().optional(),
    questionType:z.string().optional()
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) navigate({ to: "/auth" });
  }, [user, navigate]);

  return (
    <div className="min-h-screen min-w-screen p-4 relative flex flex-col overflow-hidden">
      <PlaygroundPage />
    </div>
  );
}
