import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuthStore } from "@/stores/auth-store";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { isCoordinatorRole } from "@/lib/roles";
import { AnnamDashboard_dev as AnnamDashboard } from "@/features/chatbotDashboard/AnnamDashboard_dev";
import { Tabs } from "@/components/atoms/tabs";
import { PlaygroundHeader } from "@/components/PlaygroundHeader";
import {
  chatbotSearchSchema,
  CHATBOT_SEARCH_DEFAULTS,
  sourceToInternal,
  sourceToUrl,
  viewToMapView,
  mapViewToUrl,
} from "./-searchParams";

// Same top-level route pattern as /home and /audit — a flat sibling of the
// root, not nested under any layout. Auth/role guard copied verbatim from
// /home's own guard.
export const Route = createFileRoute("/chatbot/")({
  validateSearch: chatbotSearchSchema,
  // The URL is the single source of truth for the analytics state below.
  // Bare `/chatbot` (or any partially-specified URL) is auto-canonicalized
  // to the full default URL so every other read of `Route.useSearch()` can
  // assume all three params are always present.
  beforeLoad: ({ search }) => {
    const isMissingAParam =
      search.source === undefined ||
      search.view === undefined ||
      search.user === undefined;

    if (isMissingAParam) {
      throw redirect({
        to: "/chatbot",
        search: { ...CHATBOT_SEARCH_DEFAULTS, ...search },
        replace: true,
      });
    }
  },
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

  // Analytics state is derived entirely from the URL (validated/defaulted by
  // beforeLoad above) rather than owned locally — this is what makes refresh
  // and browser Back/Forward restore the right state.
  //
  // Note: `view` here is only the top-level page mode ("dashboard" vs "map" —
  // AnnamDashboard_dev's own `mapView` toggle). It is NOT the dashboard's
  // internal sidebar navigation (DashboardView), which stays local component
  // state and is untouched by this route.
  const search = Route.useSearch();
  const chatbotSource = sourceToInternal(search.source ?? CHATBOT_SEARCH_DEFAULTS.source);
  const chatbotMapView = viewToMapView(search.view ?? CHATBOT_SEARCH_DEFAULTS.view);
  const chatbotUserType = search.user ?? CHATBOT_SEARCH_DEFAULTS.user;

  // Every filter change is a normal (non-replace) navigation so browser
  // Back/Forward moves between previous analytics states, per the existing
  // TanStack Router search-param pattern used elsewhere in this app.
  const handleSourceChange = (newSource: "annam" | "whatsapp" | "acc") => {
    navigate({
      to: "/chatbot",
      search: (prev) => ({ ...prev, source: sourceToUrl(newSource) }),
    });
  };
  const handleMapViewChange = (newMapView: boolean) => {
    navigate({
      to: "/chatbot",
      search: (prev) => ({ ...prev, view: mapViewToUrl(newMapView) }),
    });
  };
  const handleUserTypeChange = (newUserType: "all" | "external" | "internal") => {
    navigate({
      to: "/chatbot",
      search: (prev) => ({ ...prev, user: newUserType }),
    });
  };

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
    // roles as an in-home tab — preserve that same access rule now that it
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

  // Any *other* tab picked from this same header should behave exactly like
  // clicking it does on /home: persist it under the same per-user storage
  // key /home already reads on mount, then go there so it opens on that tab.
  // No query params, no new state system — reusing exactly what /home
  // already does today.
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
          setChatbotSource={handleSourceChange}
        />
        <div className="h-full py-6 min-w-0 px-4 md:px-8">
          <AnnamDashboard
            source={chatbotSource}
            onSourceChange={handleSourceChange}
            mapView={chatbotMapView}
            onMapViewChange={handleMapViewChange}
            userType={chatbotUserType}
            onUserTypeChange={handleUserTypeChange}
          />
        </div>
      </Tabs>
    </div>
  );
}
