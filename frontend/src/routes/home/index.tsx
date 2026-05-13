import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PlaygroundPage } from "@/components/play-ground";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";
import { z } from "zod";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
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
  const { data: currentUser, isLoading } = useGetCurrentUser({});

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (currentUser?.role === "pae_expert") {
      navigate({ to: "/pae-expert" });
    }
  }, [user, currentUser, navigate]);

  // Don't render anything until we know the role — prevents PlaygroundPage flash for pae_expert
  if (!user || isLoading || currentUser?.role === "pae_expert") return null;

  return (
    <div className="min-h-screen min-w-screen p-4 relative flex flex-col overflow-hidden">
      <PlaygroundPage />
    </div>
  );
}
