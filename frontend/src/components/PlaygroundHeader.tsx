import { useState, useRef, useCallback, useEffect } from "react";
import { UserProfileActions } from "@/components/atoms/user-profile-actions";
import { ThemeToggleCompact } from "./atoms/ThemeToggle";
import { BellIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { MobileSidebar } from "./mobile-sidebar";
import { HoverCard } from "./atoms/hover-card";
import { NotificationModal } from "./NotificationModal";
import { TabsList, TabsTrigger } from "@/components/atoms/tabs";
import { canManageUsers, hasFullUserManagement } from "@/lib/roles";
import { cn } from "@/lib/utils";
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollLeft, scrollWidth, clientWidth } = container;
    const overflowing = scrollWidth > clientWidth + 4;
    setIsOverflowing(overflowing);
    setCanScrollLeft(scrollLeft > 4);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
  }, []);

  useEffect(() => {
    updateScrollButtons();

    const activeBtn = scrollContainerRef.current?.querySelector<HTMLElement>(
      `[data-state="active"]`
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeTab, updateScrollButtons]);

  useEffect(() => {
    const container = scrollContainerRef.current;

    const handleResize = () => {
      updateScrollButtons();
    };

    window.addEventListener("resize", handleResize);

    let ro: ResizeObserver | null = null;
    if (container) {
      ro = new ResizeObserver(handleResize);
      ro.observe(container);
      if (container.firstElementChild) {
        ro.observe(container.firstElementChild);
      }
      container.addEventListener("scroll", updateScrollButtons, { passive: true });
    }

    const timer = setTimeout(updateScrollButtons, 50);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
      if (ro) ro.disconnect();
      if (container) container.removeEventListener("scroll", updateScrollButtons);
    };
  }, [updateScrollButtons]);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const step = Math.max(160, Math.floor(scrollContainerRef.current.clientWidth * 0.5));
      const scrollAmount = direction === "left" ? -step : step;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };
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

        <div className="flex-1 hidden md:flex items-center min-w-0 justify-center">
          {/* Scroll Left Button */}
          {isOverflowing && (
            <button
              type="button"
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              aria-label="Scroll tabs left"
              className={cn(
                "hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 mr-1",
                canScrollLeft
                  ? "hover:text-foreground hover:bg-accent border border-transparent hover:border-border/60 cursor-pointer text-foreground"
                  : "opacity-25 pointer-events-none"
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

          {/* Scrollable Tabs Track */}
          <div
            ref={scrollContainerRef}
            className="flex-1 flex items-center min-w-0 overflow-x-auto py-1 scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] touch-pan-x"
          >
            <TabsList className="flex gap-1 md:gap-2 flex-nowrap items-center bg-transparent p-0 min-w-max mx-auto h-auto">
              {user &&
                user.role !== "expert" &&
                user.role !== "call_agent" &&
                user.role !== "gate_keeper" &&
                user.role !== "auditor" && (
                  <TabsTrigger
                    value="performance"
                    className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
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
                  className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>Dashboard</span>
                  </HoverCard>
                </TabsTrigger>
              )}
              {user && user.role === "expert" && (
                <TabsTrigger
                  value="expertPerformance"
                  className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>Dashboard</span>
                  </HoverCard>
                </TabsTrigger>
              )}
              {/* Moderators keep the admin overview ("Dashboard") and get their own
                  moderator-scoped dashboard alongside it. */}
              {user && user.role === "moderator" && (
                <TabsTrigger
                  value="moderatorDashboard"
                  className="px-2 md:px-3 py-1.5 rounded-lg font-medium text-sm md:text-base transition-all duration-150 shrink-0"
                >
                  <HoverCard openDelay={150}>
                    <span>My Dashboard</span>
                  </HoverCard>
                </TabsTrigger>
              )}

              {user && user.role == "expert" && (
                <TabsTrigger
                  value="questions"
                  className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                >
                  <span>My Queue</span>
                </TabsTrigger>
              )}
              {user && user.role !== "call_agent" && (
                <TabsTrigger
                  value="all_questions"
                  className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                >
                  <span>All Questions</span>
                </TabsTrigger>
              )}

              {user && user.role !== "call_agent" && (
                <TabsTrigger
                  value="closed_answers"
                  className="relative px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                >
                  <span className="absolute -top-1 -left-1.5 z-10 inline-flex items-center rounded-full bg-red-600 px-1.5 py-[2px] text-[9px] font-semibold uppercase leading-none tracking-wide text-white dark:bg-red-500">
                    new
                  </span>
                  <span>Answer Sources</span>
                </TabsTrigger>
              )}

              {user && canManageUsers(user.role) && (
                  <TabsTrigger
                    value="user_management"
                    className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>
                        {hasFullUserManagement(user.role) ? "User" : "Expert"} Management
                      </span>
                    </HoverCard>
                  </TabsTrigger>
                )}

              {user && user.role !== "call_agent" && (
                <TabsTrigger
                  value="upload"
                  className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
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
                    className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>Dashboard</span>
                    </HoverCard>
                  </TabsTrigger>
                  <TabsTrigger
                    value="call_interface"
                    className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                  >
                    <HoverCard openDelay={150}>
                      <span>Call Interface</span>
                    </HoverCard>
                  </TabsTrigger>
                  <TabsTrigger
                    value="call_history"
                    className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
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
                  className={`px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0 ${
                    activeTab === "manage_agents"
                      ? "bg-accent text-accent-foreground"
                      : ""
                  }`}
                >
                  Manage Agents
                </TabsTrigger>
              )}

              {user &&
                (user.role === "admin" ||
                user.role === "moderator") && (
                  <TabsTrigger
                    value="chatbotanalytics"
                    className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                  >
                    <span>ChatBot Analytics</span>
                  </TabsTrigger>
                )}
              {user &&
                (user.role === "admin" || user.role === "moderator" || user.role === "expert") && (
                <TabsTrigger
                  value="data_processing"
                  className="px-2 py-1.5 rounded-lg font-medium text-xs md:text-sm transition-all duration-150 shrink-0"
                >
                  <span>Data Processing</span>
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          {/* Scroll Right Button */}
          {isOverflowing && (
            <button
              type="button"
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              aria-label="Scroll tabs right"
              className={cn(
                "hidden md:flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 ml-1",
                canScrollRight
                  ? "hover:text-foreground hover:bg-accent border border-transparent hover:border-border/60 cursor-pointer text-foreground"
                  : "opacity-25 pointer-events-none"
              )}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
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
