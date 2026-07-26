import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { UserHistoryView } from "@/components/UserHistoryView";

export const Route = createFileRoute("/user-history/$userId")({
  component: RouteComponent,
});

function RouteComponent() {
  const navigate = useNavigate();
  const { userId } = Route.useParams();

  return (
    <main className="min-h-screen bg-background p-4 sm:p-6 lg:p-8">
      <UserHistoryView
        userId={userId}
        showBack
        onBack={() => navigate({ to: "/home" })}
      />
    </main>
  );
}
