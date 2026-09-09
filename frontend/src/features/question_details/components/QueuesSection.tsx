import { useState, useRef, useEffect, useMemo } from "react";
import type { IQuestionFullData, IUser, IRerouteHistoryResponse } from "@/types";
import { RoleAssigneeQueue } from "./RoleAssigneeQueue";
import { AllocationTimeline } from "./AllocationTimeline";
import { ModeratorQueue } from "./ModeratorQueue";
import { RerouteTimeline } from "./RerouteTimeline";
import {
  ShieldCheck,
  UserCheck,
  Users,
  RefreshCcw,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";

type QueueTab = "gate_keeper" | "auditor" | "allocation" | "moderator" | "reroute" | "all";

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

  // Sync activeTab if question ID or status changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [question._id, defaultTab]);

  const groupRef = useRef<HTMLDivElement>(null);
  const [glider, setGlider] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeBtn = groupRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${activeTab}"]`
    );
    if (activeBtn && groupRef.current) {
      setGlider({
        left: activeBtn.offsetLeft,
        width: activeBtn.offsetWidth,
      });
    }
  }, [activeTab, hasReroute]);

  // Compute status summary labels for badges
  const gkName = question.assigned_gate_keeper?.name;
  const gkBadge = gkName
    ? question.gateKeeperFinishedAt
      ? "Completed"
      : gkName.split(" ")[0]
    : "Unassigned";

  const auditorName = question.assigned_auditor?.name;
  const auditorBadge = auditorName
    ? question.auditorFinishedAt
      ? "Completed"
      : auditorName.split(" ")[0]
    : "Unassigned";

  const expertCount = question.submission?.queue?.length ?? 0;
  const allocationBadge = `${expertCount} ${expertCount === 1 ? "Expert" : "Experts"}`;

  const modName = question.assigned_moderator?.name;
  const modBadge = modName
    ? question.status === "closed"
      ? "Finalized"
      : modName.split(" ")[0]
    : "Unassigned";

  const rerouteBadge = `${reroutequestionDetails?.length ?? 0} ${
    (reroutequestionDetails?.length ?? 0) === 1 ? "Reroute" : "Reroutes"
  }`;

  const tabs: {
    id: QueueTab;
    label: string;
    icon: typeof ShieldCheck;
    badge: string;
    badgeVariant: "green" | "blue" | "amber" | "muted";
  }[] = [
    {
      id: "gate_keeper",
      label: "Gate Keeper",
      icon: ShieldCheck,
      badge: gkBadge,
      badgeVariant: gkName ? "green" : "muted",
    },
    {
      id: "auditor",
      label: "Auditor",
      icon: UserCheck,
      badge: auditorBadge,
      badgeVariant: auditorName ? "green" : "muted",
    },
    {
      id: "allocation",
      label: "Allocation Queue",
      icon: Users,
      badge: allocationBadge,
      badgeVariant: expertCount > 0 ? "blue" : "muted",
    },
    {
      id: "moderator",
      label: "Moderator Queue",
      icon: UserCheck,
      badge: modBadge,
      badgeVariant: modName ? "green" : "muted",
    },
  ];

  if (hasReroute) {
    tabs.push({
      id: "reroute",
      label: "Re-route",
      icon: RefreshCcw,
      badge: rerouteBadge,
      badgeVariant: "amber",
    });
  }

  tabs.push({
    id: "all",
    label: "All Queues",
    icon: Layers,
    badge: "Overview",
    badgeVariant: "muted",
  });

  return (
    <div className="w-full space-y-4 my-4">
      {/* Horizontal Bar Container */}
      <div
        ref={groupRef}
        className="relative flex w-full items-center gap-1.5 rounded-xl border border-border bg-muted/40 p-1.5 overflow-x-auto scrollbar-hiding flex-nowrap shadow-sm"
      >
        {/* Animated Glider Background */}
        <span
          className="absolute inset-y-1.5 rounded-lg border border-border/60 bg-background shadow-sm transition-all duration-200"
          style={{ left: glider.left, width: glider.width }}
        />

        {tabs.map(({ id, label, icon: Icon, badge, badgeVariant }) => {
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              data-tab={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "relative z-10 flex flex-shrink-0 items-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors cursor-pointer select-none",
                isActive
                  ? "text-foreground font-semibold scale-[1.01]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
              <span>{label}</span>
              <span
                className={cn(
                  "ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none",
                  badgeVariant === "green" && "bg-green-500/15 text-green-700 dark:text-green-400",
                  badgeVariant === "blue" && "bg-blue-500/15 text-blue-700 dark:text-blue-400",
                  badgeVariant === "amber" && "bg-amber-500/15 text-amber-700 dark:text-amber-400",
                  badgeVariant === "muted" && "bg-muted-foreground/15 text-muted-foreground"
                )}
              >
                {badge}
              </span>
            </button>
          );
        })}
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

        {hasReroute && (activeTab === "reroute" || activeTab === "all") && (
          <RerouteTimeline
            currentUser={currentUser}
            rerouteData={reroutequestionDetails!}
          />
        )}
      </div>
    </div>
  );
};
