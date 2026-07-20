import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "./atoms/ThemeToggle";
import { BellIcon } from "lucide-react";
import { MobileSidebar } from "./mobile-sidebar";
import { HoverCard } from "./atoms/hover-card";
import { NotificationModal } from "./NotificationModal";
import { TabsList, TabsTrigger } from "@/components/atoms/tabs";
import type { IUser } from "@/types";

export function PlaygroundHeader({
  user,
  activeTab,
  onTabChange,
  setTab,
  setChatbotSource,
}: {
  user: IUser | null | undefined;
  activeTab: string;
  onTabChange: (value: string) => void;
  setTab: (value: string) => void;
  setChatbotSource: (value: "whatsapp" | "annam" | "acc") => void;
}) {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex items-center justify-between gap-4 px-4 py-3">
        {/* Logo */}
        <div className="flex items-center gap-3 shrink-0">
          <img
            src="/annam-logo.png"
            alt="Annam Logo"
            className="h-10 w-auto md:h-14"
          />
        </div>

        <div className="flex-1 md:flex justify-center min-w-0 hidden ">
          <TabsList className="flex gap-2 overflow-x-auto whitespace-nowrap bg-transparent p-0 no-scrollbar">
            {user &&
              user.role !== "expert" &&
              user.role !== "call_agent" &&
              user.role !== "gate_keeper" &&
              user.role !== "auditor" && (
                <TabsTrigger
                  value="performance"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>Dashboard</span>
                  </HoverCard>
                </TabsTrigger>
              )}
            {/* Gate keepers / auditors get their own role dashboard instead. */}
            {user && (user.role === "gate_keeper" || user.role === "auditor") && (
              <TabsTrigger
                value="roleDashboard"
                className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
              >
                <HoverCard openDelay={150}>
                  <span>Dashboard</span>
                </HoverCard>
              </TabsTrigger>
            )}
            {user && user.role === "expert" && (
              <TabsTrigger
                value="expertPerformance"
                className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
              >
                <HoverCard openDelay={150}>
                  <span>Dashboard</span>
                </HoverCard>
              </TabsTrigger>
            )}

            {user && user.role == "expert" && (
              <TabsTrigger
                value="questions"
                className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
              >
                <span>My Queue</span>
              </TabsTrigger>
            )}
            {user && user.role !== "call_agent" && (
              <TabsTrigger
                value="all_questions"
                className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
              >
                <span>All Questions</span>
              </TabsTrigger>
            )}

            {user &&
              user.role !== "expert" &&
              user.role !== "call_agent" && (
                <TabsTrigger
                  value="user_management"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>
                      {user.role === "admin" ? "User" : "Expert"} Management
                    </span>
                  </HoverCard>
                </TabsTrigger>
              )}

            {user && user.role !== "call_agent" && (
              <TabsTrigger
                value="upload"
                className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
              >
                <HoverCard openDelay={150}>
                  <span>Agents Interface</span>
                </HoverCard>
              </TabsTrigger>
            )}

            {user?.role === "call_agent" && (
              <>
                <TabsTrigger
                  value="call_dashboard"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>Dashboard</span>
                  </HoverCard>
                </TabsTrigger>
                <TabsTrigger
                  value="call_interface"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>Call Interface</span>
                  </HoverCard>
                </TabsTrigger>
                <TabsTrigger
                  value="call_history"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>Call History</span>
                  </HoverCard>
                </TabsTrigger>
              </>
            )}

            {user?.role === "admin" && (
              <TabsTrigger
                value="manage_agents"
                onClick={() => onTabChange("manage_agents")}
                className={
                  activeTab === "manage_agents"
                    ? "bg-accent text-accent-foreground"
                    : ""
                }
              >
                Manage Agents
              </TabsTrigger>
            )}

            {user &&
              (user.role === "admin" ||
              user.role === "moderator") && (
                <TabsTrigger
                  value="chatbotanalytics"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
                >
                  <span>ChatBot Analytics</span>
                </TabsTrigger>
              )}
            {user && user.role === "admin" && (
              <TabsTrigger
                value="data_processing"
                className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 flex-shrink-0"
              >
                <span>Data Processing</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* RIGHT SIDE ICONS */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Notifications */}
          <NotificationModal
            trigger={
              <button className="relative p-1 rounded-md hover:bg-accent transition-colors">
                <BellIcon className="w-5 h-5 text-muted-foreground hover:text-foreground transition" />
                {user?.notifications! > 0 && (
                  <span className="absolute -top-[4px] -right-[12px] flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1.5 text-[10px] font-semibold text-white">
                    {user?.notifications! > 99
                      ? "99+"
                      : user?.notifications}
                  </span>
                )}
              </button>
            }
          />

          <ThemeToggleCompact />

          <UserProfileActions />

          <MobileSidebar
            user={user!}
            setTab={setTab}
            setChatbotSource={setChatbotSource}
          />
        </div>
      </div>
    </header>
  );
}
