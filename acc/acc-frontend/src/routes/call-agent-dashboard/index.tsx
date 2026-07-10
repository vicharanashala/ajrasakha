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
import { ACCAnalyticsDashboard } from "@/components/ACCAnalyticsDashboard";
import { ManageCallAgents } from "@/components/ManageCallAgents";
import { Spinner } from "@/components/atoms/spinner";
import {
  Phone,
  Clock,
  TrendingUp,
  BarChart3,
  Users
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/call-agent-dashboard/")({
  component: DashboardComponent,
});

function DashboardComponent() {
  const navigate = useNavigate();
  const { user: authUser } = useAuthStore();
  const { data: user, isLoading } = useGetCurrentUser({ enabled: !!authUser });
  const [activeTab, setActiveTab] = useState("call_dashboard");

  useEffect(() => {
    if (!authUser) {
      navigate({ to: "/auth" });
    }
  }, [authUser, navigate]);

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
        ]
      : []),
  ];

  // If activeTab is not in menuItems, set default
  const hasActiveTab = menuItems.some((item) => item.id === activeTab);
  const currentTab = hasActiveTab ? activeTab : menuItems[0]?.id || "";

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
              <span className="font-bold text-sm bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent hidden sm:inline">
                ACC Call Center
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
              </>
            )}
          </div>
        </main>
      </Tabs>
    </div>
  );
}
