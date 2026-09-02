import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/atoms/tabs";
import { ThemeToggleCompact } from "@/components/atoms/ThemeToggle";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { CallAgentDashboard } from "@/components/CallAgentDashboard";
import { CallInterface } from "@/components/CallInterface";
import { CallHistory } from "@/components/CallHistory";
import { CallLog } from "@/components/CallLog";
import { ACCAnalyticsDashboard } from "@/components/ACCAnalyticsDashboard";
import { ManageCallAgents } from "@/components/ManageCallAgents";
import { Spinner } from "@/components/atoms/spinner";
import { UserService } from "@/hooks/services/userService";
import { cn } from "@/lib/utils";

import {
  Phone,
  Clock,
  TrendingUp,
  BarChart3,
  Users,
  Loader2,
} from "lucide-react";
import { PlivoProvider } from "@/context/PlivoContext";
import { toast } from "sonner";

export const Route = createFileRoute("/call-agent-dashboard/")({
  component: DashboardWithProvider,
});

function DashboardWithProvider() {
  return (
    <PlivoProvider>
      <DashboardComponent />
    </PlivoProvider>
  );
}

function DashboardComponent() {
  const navigate = useNavigate();
  const { user: authUser } = useAuthStore();
  const { data: user, isLoading, refetch: refetchUser } = useGetCurrentUser({ enabled: !!authUser });
  const [activeTab, setActiveTab] = useState("call_dashboard");
  const [isTogglingStatus, setIsTogglingStatus] = useState(false);

  useEffect(() => {
    if (!authUser) {
      navigate({ to: "/auth" });
    }
  }, [authUser, navigate]);

  // Heartbeat for Call Agents
  useEffect(() => {
    if (!user || user.role !== "call_agent" || !user.isCallAgentActive) return;

    const userService = new UserService();
    const sendHeartbeat = async () => {
      try {
        await userService.sendHeartbeat();
      } catch (err) {
        console.error("Failed to send heartbeat:", err);
      }
    };

    sendHeartbeat();

    const interval = setInterval(sendHeartbeat, 30000);

    return () => clearInterval(interval);
  }, [user?.role, user?.isCallAgentActive]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  const isCallAgent = user.role === "call_agent";
  const isAdmin = user.role === "admin" || user.role === "moderator";

  const menuItems = [
    ...(isCallAgent
      ? [
          { id: "call_dashboard", label: "Dashboard", icon: TrendingUp },
          { id: "call_interface", label: "Call Interface", icon: Phone },
          { id: "call_history", label: "Call History", icon: Clock },
        ]
      : []),
    ...(isAdmin
      ? [
          { id: "acc_analytics", label: "ACC Analytics", icon: BarChart3 },
          { id: "manage_agents", label: "Manage Agents", icon: Users },
          { id: "call_log", label: "Call Log", icon: Clock },
        ]
      : []),
  ];

  // If activeTab is not in menuItems, set default
  const hasActiveTab = menuItems.some((item) => item.id === activeTab);
  const currentTab = hasActiveTab ? activeTab : menuItems[0]?.id || "";

  const isAgentOnline = Boolean(user?.isCallAgentActive) || (Boolean(user?.agent) && user?.agent !== "not_available");

  const handleToggleAgentStatus = async () => {
    if (isTogglingStatus) return;
    setIsTogglingStatus(true);
    const newStatus = !isAgentOnline;
    try {
      const userService = new UserService();
      await userService.toggleAgentStatus(newStatus);
      toast.success(
        newStatus
          ? "You are now online and ready to receive calls"
          : "You are now offline",
      );
      await refetchUser();
    } catch (error: any) {
      console.error("Error toggling agent status:", error);
      toast.error(error.message || "Failed to update agent status");
    } finally {
      setIsTogglingStatus(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden font-sans">
      <Tabs value={currentTab} onValueChange={setActiveTab} className="h-full flex flex-col w-full">
        {/* Top Navbar */}
        <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60 shrink-0">
          <div className="mx-auto flex items-center justify-between gap-4 px-4 py-3">
            {/* Logo */}
            <div className="flex items-center gap-3 shrink-0">
              <img
                src="/annam-logo.png"
                alt="Annam Logo"
                className="h-10 w-auto md:h-14"
              />
              <span className="font-extrabold text-base md:text-xl text-primary-accent tracking-tight hidden sm:inline-block">
                Annam Call Center
              </span>
            </div>

            {/* Navigation Tabs */}
            <div className="flex-1 flex justify-center min-w-0">
              <TabsList className="flex gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0 no-scrollbar">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <TabsTrigger
                      key={item.id}
                      value={item.id}
                      className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0 flex items-center gap-2 cursor-pointer"
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </TabsTrigger>
                  );
                })}
              </TabsList>
            </div>

            {/* Right Side Controls */}
            <div className="flex items-center gap-3 shrink-0">
              {isCallAgent && (
                <button
                  type="button"
                  onClick={handleToggleAgentStatus}
                  disabled={isTogglingStatus}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold tracking-wide transition-all duration-200 border cursor-pointer select-none shadow-sm",
                    isAgentOnline
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20 shadow-emerald-500/5"
                      : "bg-zinc-100 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400 border-zinc-300 dark:border-zinc-700 hover:bg-zinc-200/80 dark:hover:bg-zinc-700/60"
                  )}
                  title={isAgentOnline ? "Click to Go Offline" : "Click to Go Online"}
                >
                  {isTogglingStatus ? (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  ) : (
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        isAgentOnline
                          ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"
                          : "bg-zinc-400 dark:bg-zinc-500"
                      )}
                    />
                  )}
                  <span>{isAgentOnline ? "Online" : "Offline"}</span>
                </button>
              )}

              <ThemeToggleCompact />
              
              {/* User Dropdown Profile Actions */}
              <UserProfileActions />
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-background">
          <div className="flex-1">
            {isCallAgent && (
              <>
                <TabsContent value="call_interface" className="m-0 h-full p-6 outline-none">
                  <CallInterface />
                </TabsContent>
                <TabsContent value="call_dashboard" className="m-0 h-full p-6 outline-none">
                  <CallAgentDashboard />
                </TabsContent>
                <TabsContent value="call_history" className="m-0 h-full p-6 outline-none">
                  <div className="w-full max-w-full">
                    <CallHistory onRedial={() => setActiveTab("call_interface")} />
                  </div>
                </TabsContent>
              </>
            )}
            {isAdmin && (
              <>
                <TabsContent value="acc_analytics" className="m-0 h-full p-6 outline-none">
                  <ACCAnalyticsDashboard />
                </TabsContent>
                <TabsContent value="manage_agents" className="m-0 h-full p-6 outline-none">
                  <ManageCallAgents />
                </TabsContent>
                <TabsContent value="call_log" className="m-0 h-full p-6 outline-none">
                  <div className="w-full max-w-full">
                    <CallLog />
                  </div>
                </TabsContent>
              </>
            )}
          </div>
        </main>
      </Tabs>
    </div>
  );
}
