import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { RevampQaLayout } from "@/features/rewamp-qa-interface-page";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";

export const Route = createFileRoute("/revamp-qa/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser } = useGetCurrentUser({});

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen min-w-screen relative flex flex-col bg-background">
      {/* Top Application Bar */}
      <header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card/60 backdrop-blur-xs sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <Link to="/home">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
              Back to Dashboard
            </Button>
          </Link>

          <div className="h-4 w-px bg-border hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-foreground tracking-tight">
              Ajrasakha
            </span>
            <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800">
              Revamped QA
            </Badge>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <ThemeToggleCompact />
          {user && <UserProfileActions />}
        </div>
      </header>

      {/* Main Revamped QA Layout */}
      <main className="flex-1">
        <RevampQaLayout />
      </main>
    </div>
  );
}
