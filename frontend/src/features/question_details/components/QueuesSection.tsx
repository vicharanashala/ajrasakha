import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { IQuestionFullData, IUser, IRerouteHistoryResponse } from "@/types";
import { RoleAssigneeQueue } from "./RoleAssigneeQueue";
import { AllocationTimeline } from "./AllocationTimeline";
import { ModeratorQueue } from "./ModeratorQueue";
import { RerouteTimeline } from "./RerouteTimeline";
import { FeedbackReviewTimeline } from "@/components/FeedbackReviewTimeline";
import PaeValidationReviewTimeline from "@/components/PaeValidationReviewTimeline";
import {
  ShieldCheck,
  UserCheck,
  Users,
  RefreshCcw,
  MessageSquareDiff,
  ClipboardCheck,
  Layers,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";

type QueueTab =
  | "gate_keeper"
  | "auditor"
  | "allocation"
  | "moderator"
  | "reroute"
  | "feedback"
  | "pae_validation"
  | "all";

interface QueuesSectionProps {
  question: IQuestionFullData;
  currentUser: IUser;
  reroutequestionDetails?: IRerouteHistoryResponse[];
}

export const QueuesSection = ({
  question,
  currentUser,
  reroutequestionDetails,
}: QueuesSectionProps) => {
  const hasReroute = reroutequestionDetails && reroutequestionDetails.length >= 1;
  const closedStatus = ["closed", "dynamic_closed", "duplicate_closed"].includes(question?.status);

  const showFeedbackQueue = !!question?._id && !!currentUser && currentUser.role !== "expert";
  const canManageFeedback =
    currentUser?.role === "admin" ||
    currentUser?.role === "moderator" ||
    currentUser?.role === "gate_keeper" ||
    currentUser?.role === "auditor";

  const showPaeValidationQueue = !!question?._id && !!currentUser && currentUser.role !== "expert" && closedStatus;
  const canManagePaeValidation =
    question?.paeValidation !== "completed" &&
    closedStatus &&
    (currentUser?.role === "admin" || currentUser?.role === "moderator");

  const defaultTab = useMemo<QueueTab>(() => {
    const status = question.status;
    if (["dynamic", "duplicate", "queue_duplicate"].includes(status)) {
      return "gate_keeper";
    }
    if (status === "auditor_review") {
      return "auditor";
    }
    if (["in-review", "re-routed"].includes(status)) {
      return "moderator";
    }
    return "allocation";
  }, [question.status]);

  const [activeTab, setActiveTab] = useState<QueueTab>(defaultTab);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const [glider, setGlider] = useState({ left: 0, width: 0 });
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Mouse drag-to-scroll state
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeftState, setScrollLeftState] = useState(0);

  // Sync activeTab if question ID or status changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [question._id, defaultTab]);

  const updateScrollButtons = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 4);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 4);
    }
  }, []);

  const updateGlider = useCallback(() => {
    const activeBtn = groupRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${activeTab}"]`
    );
    if (activeBtn && groupRef.current) {
      setGlider({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeTab]);

  useEffect(() => {
    updateGlider();
    updateScrollButtons();

    const activeBtn = groupRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${activeTab}"]`
    );
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeTab, hasReroute, showFeedbackQueue, showPaeValidationQueue, updateGlider, updateScrollButtons]);

  // Recalculate glider & scroll buttons dynamically on resize
  useEffect(() => {
    const container = scrollContainerRef.current;
    const group = groupRef.current;

    const handleResize = () => {
      updateGlider();
      updateScrollButtons();
    };

    window.addEventListener("resize", handleResize);

    let ro: ResizeObserver | null = null;
    if (group) {
      ro = new ResizeObserver(handleResize);
      ro.observe(group);
    }

    if (container) {
      container.addEventListener("scroll", updateScrollButtons, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (ro) ro.disconnect();
      if (container) container.removeEventListener("scroll", updateScrollButtons);
    };
  }, [updateGlider, updateScrollButtons]);

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === "left" ? -240 : 240;
      scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    setIsMouseDown(true);
    setStartX(e.pageX - scrollContainerRef.current.offsetLeft);
    setScrollLeftState(scrollContainerRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !scrollContainerRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollContainerRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;
    scrollContainerRef.current.scrollLeft = scrollLeftState - walk;
  };

  // Compute status summary labels for badges & tooltips
  const gkName = question.assigned_gate_keeper?.name;
  const gkBadge = gkName
    ? question.gateKeeperFinishedAt
      ? "Done"
      : gkName.split(" ")[0]
    : "Unassigned";

  const auditorName = question.assigned_auditor?.name;
  const auditorBadge = auditorName
    ? question.auditorFinishedAt
      ? "Done"
      : auditorName.split(" ")[0]
    : "Unassigned";

  const expertCount = question.submission?.queue?.length ?? 0;
  const allocationBadge = `${expertCount}`;

  const modName = question.assigned_moderator?.name;
  const modBadge = modName
    ? question.status === "closed"
      ? "Finalized"
      : modName.split(" ")[0]
    : "Unassigned";

  const rerouteBadge = `${reroutequestionDetails?.length ?? 0}`;

  const tabs: {
    id: QueueTab;
    label: string;
    fullLabel: string;
    icon: typeof ShieldCheck;
    badge: string;
    badgeVariant: "green" | "blue" | "amber" | "muted";
    tooltip: string;
  }[] = [
    {
      id: "gate_keeper",
      label: "Gate Keeper",
      fullLabel: "Gate Keeper Queue",
      icon: ShieldCheck,
      badge: gkBadge,
      badgeVariant: gkName ? "green" : "muted",
      tooltip: gkName ? `Assigned to ${gkName}` : "No Gate Keeper assigned",
    },
    {
      id: "auditor",
      label: "Auditor",
      fullLabel: "Auditor Queue",
      icon: UserCheck,
      badge: auditorBadge,
      badgeVariant: auditorName ? "green" : "muted",
      tooltip: auditorName ? `Assigned to ${auditorName}` : "No Auditor assigned",
    },
    {
      id: "allocation",
      label: "Allocation",
      fullLabel: "Expert Allocation Queue",
      icon: Users,
      badge: allocationBadge,
      badgeVariant: expertCount > 0 ? "blue" : "muted",
      tooltip: `${expertCount} expert(s) in allocation queue`,
    },
    {
      id: "moderator",
      label: "Moderator",
      fullLabel: "Moderator Queue",
      icon: UserCheck,
      badge: modBadge,
      badgeVariant: modName ? "green" : "muted",
      tooltip: modName ? `Assigned to ${modName}` : "No Moderator assigned",
    },
    {
      id: "reroute",
      label: "Re-route",
      fullLabel: "Re-route Queue History",
      icon: RefreshCcw,
      badge: rerouteBadge,
      badgeVariant: (reroutequestionDetails?.length ?? 0) > 0 ? "amber" : "muted",
      tooltip: `${reroutequestionDetails?.length ?? 0} re-route event(s)`,
    },
  ];

  if (showFeedbackQueue) {
    tabs.push({
      id: "feedback",
      label: "Feedback",
      fullLabel: "Feedback Review Queue",
      icon: MessageSquareDiff,
      badge: "Review",
      badgeVariant: "amber",
      tooltip: "Feedback Review Timeline & Rounds",
    });
  }

  if (showPaeValidationQueue) {
    tabs.push({
      id: "pae_validation",
      label: "PAE Validation",
      fullLabel: "PAE Validation Review Queue",
      icon: ClipboardCheck,
      badge: question?.paeValidation ? String(question.paeValidation).toUpperCase() : "PAE",
      badgeVariant: question?.paeValidation === "completed" ? "green" : "blue",
      tooltip: `PAE Validation: ${question?.paeValidation || "Pending"}`,
    });
  }

  tabs.push({
    id: "all",
    label: "All",
    fullLabel: "All Queues Overview",
    icon: Layers,
    badge: "All",
    badgeVariant: "muted",
    tooltip: "Expand all queue sections simultaneously",
  });

  return (
    <TooltipProvider delayDuration={400}>
      <div className="w-full max-w-full space-y-4 my-4 overflow-x-hidden">
        {/* Horizontal Bar Wrapper with Responsive Scroll Controls */}
        <div className="relative flex items-center w-full max-w-full group">
          {/* Scroll Left Button */}
          {canScrollLeft && (
            <button
              onClick={() => scroll("left")}
              className="hidden md:flex absolute left-1 z-30 p-1.5 rounded-full bg-background/90 backdrop-blur-md border border-border shadow-md text-foreground hover:bg-muted transition-all duration-200"
              title="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}

          {/* Horizontal Bar Container */}
          <div
            ref={scrollContainerRef}
            onMouseDown={handleMouseDown}
            onMouseLeave={handleMouseLeaveOrUp}
            onMouseUp={handleMouseLeaveOrUp}
            onMouseMove={handleMouseMove}
            className="relative flex w-full items-center gap-1 sm:gap-1.5 rounded-xl border border-border bg-muted/40 p-1.5 overflow-x-auto overflow-y-hidden flex-nowrap shadow-sm touch-pan-x active:cursor-grabbing select-none scrollbar-none [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scrollbar-hiding"
          >
            <div ref={groupRef} className="relative flex items-center gap-1 sm:gap-1.5 flex-nowrap min-w-max">
              {/* Animated Glider Background */}
              <span
                className="absolute inset-y-0.5 rounded-lg border border-border/60 bg-background shadow-sm transition-all duration-200"
                style={{ left: glider.left, width: glider.width }}
              />

              {tabs.map(({ id, label, fullLabel, icon: Icon, badge, badgeVariant, tooltip }) => {
                const isActive = activeTab === id;
                return (
                  <Tooltip key={id}>
                    <TooltipTrigger asChild>
                      <button
                        data-tab={id}
                        onClick={() => setActiveTab(id)}
                        className={cn(
                          "relative z-10 flex flex-shrink-0 items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all duration-200 cursor-pointer select-none whitespace-nowrap",
                          isActive
                            ? "text-foreground font-semibold scale-[1.01]"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Icon className={cn("h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                        <span>{label}</span>
                        <span
                          className={cn(
                            "ml-0.5 sm:ml-1 rounded-full px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-semibold leading-none",
                            badgeVariant === "green" && "bg-green-500/15 text-green-700 dark:text-green-400",
                            badgeVariant === "blue" && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                            badgeVariant === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                            badgeVariant === "muted" && "bg-muted-foreground/15 text-muted-foreground"
                          )}
                        >
                          {badge}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      <p className="font-semibold">{fullLabel}</p>
                      <p className="text-muted-foreground">{tooltip}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* Scroll Right Button */}
          {canScrollRight && (
            <button
              onClick={() => scroll("right")}
              className="hidden md:flex absolute right-1 z-30 p-1.5 rounded-full bg-background/90 backdrop-blur-md border border-border shadow-md text-foreground hover:bg-muted transition-all duration-200"
              title="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Selected Queue Content Details */}
        <div className="space-y-6 pt-2">
          {(activeTab === "gate_keeper" || activeTab === "all") && (
            <RoleAssigneeQueue
              title="Gate Keeper Queue"
              noun="gate keeper"
              role="gate_keeper"
              question={question}
              currentUser={currentUser}
              initialOpen={true}
            />
          )}

          {(activeTab === "auditor" || activeTab === "all") && (
            <RoleAssigneeQueue
              title="Auditor Queue"
              noun="auditor"
              role="auditor"
              question={question}
              currentUser={currentUser}
              initialOpen={true}
            />
          )}

          {(activeTab === "allocation" || activeTab === "all") && (
            <AllocationTimeline
              history={question.submission.history}
              queue={question.submission.queue}
              currentUser={currentUser}
              question={question}
              initialOpen={true}
            />
          )}

          {(activeTab === "moderator" || activeTab === "all") && (
            <ModeratorQueue
              question={question}
              currentUser={currentUser}
              initialOpen={true}
            />
          )}

          {(activeTab === "reroute" || activeTab === "all") && (
            <RerouteTimeline
              currentUser={currentUser}
              rerouteData={reroutequestionDetails ?? []}
            />
          )}

          {showFeedbackQueue && (activeTab === "feedback" || activeTab === "all") && (
            <FeedbackReviewTimeline
              questionId={question._id}
              canManage={canManageFeedback}
              initialOpen={true}
            />
          )}

          {showPaeValidationQueue && (activeTab === "pae_validation" || activeTab === "all") && (
            <PaeValidationReviewTimeline
              questionId={question._id}
              canManage={canManagePaeValidation}
              initialOpen={true}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
};
