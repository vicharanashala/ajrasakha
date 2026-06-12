import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";
import { useAuthStore } from "@/stores/auth-store";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useUserProfile } from "@/features/chatbotDashboard/hooks/useUserDetails";
import { FarmerDetailsContent } from "@/components/user/FarmerDetailsContent";
import { Home } from "lucide-react";
import { Button } from "@/components/atoms/button";
import Spinner from "@/components/atoms/spinner";


export const Route = createFileRoute("/user/$userId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser, isLoading } = useGetCurrentUser({
    enabled: !!user,
  });
  const { userId } = Route.useParams();

  const {
    data: userProfile,
    isFetching: userProfileFetching,
    isLoading: userProfileLoading,
  } = useUserProfile(userId);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }

    if (
      currentUser &&
      currentUser?.role !== "admin" &&
      !isCoordinatorRole(currentUser.role)
    ) {
      navigate({ to: "/home" });
    }
  }, [user, currentUser, navigate]);

  if(!user || userProfileLoading || userProfileFetching){
    return(<>
    <Spinner/>
    </>)
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-2">
            <Button
      variant="outline"
      size="sm"
      onClick={() => navigate({ to: "/home" })}
    >
      <Home className="h-4 w-4 mr-2" />
      Home
    </Button>
        <h1 className="text-base font-semibold">User Dashboard</h1>
        <div className="flex items-center gap-2">
          <ThemeToggleCompact />
          <UserProfileActions />
        </div>
      </header>
      <div className="p-6">
        <FarmerDetailsContent user={userProfile} />
      </div>
    </div>
  );
}
