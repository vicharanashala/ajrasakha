import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";
import { AnnamDashboard_dev as AnnamDashboard } from "@/features/chatbotDashboard/AnnamDashboard_dev";
import { Tabs } from "@/components/atoms/tabs";
import { PlaygroundHeader } from "@/components/PlaygroundHeader";

// Same top-level route pattern as /home and /audit — a flat sibling of the
// root, not nested under any layout. Auth/role guard copied verbatim from
// /home's own guard.
export const Route = createFileRoute("/chatbot/")({
  component: RouteComponent,
});

const getStorageKey = (user?: { email?: string }) => {
  if (!user?.email) return null;
  return `playground_active_tab_${user.email}`;
};

function RouteComponent() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { data: currentUser, isLoading } = useGetCurrentUser({ enabled: !!user });

  // Same source-selector state PlaygroundPage already owns for this
  // component. AnnamDashboard_dev itself and its props are untouched.
  const [chatbotSource, setChatbotSource] = useState<"annam" | "whatsapp" | "acc">("annam");
  useEffect(() => {
    const saved = localStorage.getItem("application-filter");
    if (saved === "annam" || saved === "whatsapp" || saved === "acc") {
      setChatbotSource(saved);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate({ to: "/auth" });
      return;
    }
    if (currentUser?.role === "pae_expert") {
      navigate({ to: "/pae-expert" });
      return;
    }
    if (isCoordinatorRole(currentUser?.role)) {
      navigate({
        to: "/user/$userId",
        params: { userId: currentUser?._id || user.uid },
      });
      return;
    }
    // Chatbot Analytics was only ever shown to non-expert, non-call-agent
    // roles as an in-home tab - preserve that same access rule now that it
    // has a direct URL.
    if (currentUser?.role === "expert" || currentUser?.role === "call_agent") {
      navigate({ to: "/home" });
      return;
    }
  }, [user, currentUser, navigate]);

  const blocked =
    !user ||
    isLoading ||
    currentUser?.role === "pae_expert" ||
    isCoordinatorRole(currentUser?.role) ||
    currentUser?.role === "expert" ||
    currentUser?.role === "call_agent";

 
  const handleOtherTabSelected = (value: string) => {
    if (value === "chatbotanalytics") return;
    if (!user) return;
    const storageKey = getStorageKey(user);
    if (storageKey) localStorage.setItem(storageKey, value);
    navigate({ to: "/home" });
  };

  if (blocked) return null;

  return (
    <div className="min-h-screen min-w-screen p-4 relative flex flex-col overflow-hidden">
      <Tabs
        value="chatbotanalytics"
        onValueChange={handleOtherTabSelected}
        className="h-full w-full"
      >
        <PlaygroundHeader
          user={currentUser}
          activeTab="chatbotanalytics"
          onTabChange={handleOtherTabSelected}
          setTab={handleOtherTabSelected}
          setChatbotSource={setChatbotSource}
        />
        <div className="h-full py-6 min-w-0 px-4 md:px-8">
          <AnnamDashboard source={chatbotSource} onSourceChange={setChatbotSource} />
        </div>
      </Tabs>
    </div>
  );
}
