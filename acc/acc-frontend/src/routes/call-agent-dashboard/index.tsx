import { useState, useEffect } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthStore } from "@/stores/auth-store";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { Tabs, TabsContent } from "@/components/atoms/tabs";
import { ThemeToggle } from "@/components/atoms/ThemeToggle";
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
  Users,
  LogOut,
  UserCheck
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/call-agent-dashboard/")({
  component: DashboardComponent,
});

function DashboardComponent() {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuthStore();
  const { data: user, isLoading } = useGetCurrentUser({ enabled: !!authUser });
  const [activeTab, setActiveTab] = useState("call_interface");

  useEffect(() => {
    if (!authUser) {
      navigate({ to: "/auth" });
    }
  }, [authUser, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
      toast.success("Successfully logged out.");
      navigate({ to: "/auth" });
    } catch (e: any) {
      toast.error("Logout failed.");
    }
  };

  const isCallAgent = user.role === "call_agent";
  const isAdmin = user.role === "admin" || user.role === "moderator";

  const menuItems = [
    ...(isCallAgent
      ? [
          { id: "call_interface", label: "Call Interface", icon: Phone },
          { id: "call_dashboard", label: "Call Dashboard", icon: TrendingUp },
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
    <div className="flex h-screen bg-slate-950 text-white overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between p-4">
        <div className="space-y-6">
          <div className="flex items-center gap-3 px-2 py-3 border-b border-slate-800">
            <img src="/logo.png" alt="Logo" className="w-10 h-10 object-contain" />
            <div>
              <h1 className="font-bold text-sm bg-gradient-to-r from-green-300 to-emerald-400 bg-clip-text text-transparent">
                ACC Call Center
              </h1>
              <p className="text-[10px] text-slate-400 capitalize">{user.role}</p>
            </div>
          </div>

          <nav className="space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                    isActive
                      ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/10"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3 p-2 bg-slate-800/50 rounded-lg border border-slate-800">
            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center font-bold text-emerald-400">
              {user.firstName[0]}
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold truncate">{user.firstName} {user.lastName || ""}</p>
              <p className="text-[9px] text-slate-400 truncate">{user.email}</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-850 pt-3">
            <ThemeToggle />
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-400 hover:text-red-300 hover:bg-red-950/20 rounded-md transition-all cursor-pointer border-none bg-transparent"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-slate-950/50">
        <Tabs value={currentTab} className="h-full flex flex-col">
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
        </Tabs>
      </main>
    </div>
  );
}
