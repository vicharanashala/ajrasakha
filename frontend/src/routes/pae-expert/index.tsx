import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PAEExpertPage } from "@/features/pae-expert-page/PAEExpertPage";
import { useAuthStore } from "@/stores/auth-store";
import { useEffect } from "react";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { NotificationModal } from "@/components/NotificationModal";
import { BellIcon } from "lucide-react";

export const Route = createFileRoute("/pae-expert/")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser } = useGetCurrentUser({});

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (currentUser && currentUser.role !== "pae_expert") {
      navigate({ to: "/home" });
    }
  }, [user, currentUser, navigate]);

  return (
    <div className="min-h-screen min-w-screen relative flex flex-col overflow-hidden">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700 ">
        <h1 className="text-lg font-semibold">PAE Expert Portal</h1>
        <div className="flex items-center gap-2">
          <NotificationModal
            trigger={
              <button className="relative p-1 rounded-md hover:bg-accent transition-colors">
                <BellIcon className="w-5 h-5 text-muted-foreground hover:text-foreground transition" />
                {currentUser?.notifications! > 0 && (
                  <span className="absolute -top-[4px] -right-[12px] flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">
                    {currentUser?.notifications! > 99 ? "99+" : currentUser?.notifications}
                  </span>
                )}
              </button>
            }
          />
          <ThemeToggleCompact />
          <UserProfileActions />
        </div>
      </header>
      <main className="flex-1 overflow-auto">
        <PAEExpertPage />
      </main>
    </div>
  );
}
