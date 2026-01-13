import type { IRerouteHistoryResponse, IUser } from "@/types";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  RefreshCcw,
  UserCheck,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

interface RerouteTimelineProps {
  currentUser: IUser;
  rerouteData: IRerouteHistoryResponse[];
}
export const RerouteTimeline = ({
  currentUser,
  rerouteData,
}: RerouteTimelineProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);
  const [flippedId, setFlippedId] = useState("");
  const [hoverTimeout, setHoverTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const INITIAL_DISPLAY_COUNT = 12;

  const handleMouseEnter = (id: string) => {
    const timeout = setTimeout(() => {
      setFlippedId(id);
      setIsFlipped(true);
    }, 1000);
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setFlippedId("");
    setIsFlipped(false);
  };

  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [hoverTimeout]);

  // Extract reroutes from the data
  const reroutes = rerouteData?.[0]?.reroutes || [];

  const displayedReroutes = isExpanded
    ? reroutes
    : reroutes.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = reroutes.length > INITIAL_DISPLAY_COUNT;
  type LetterIconProps = {
    letter: string;
    className?: string;
  };

  const LetterIcon = ({ letter, className }: LetterIconProps) => {
    return (
      <div
        className={`  text-red flex items-center justify-center text-xs font-semibold ${className}`}
      >
        {letter}
      </div>
    );
  };

  // Convenience components
  const ExpertIcon = (props: { className?: string }) => (
    <LetterIcon letter="E" {...props} />
  );

  const ModeratorIcon = (props: { className?: string }) => (
    <LetterIcon letter="M" {...props} />
  );

  const getStatusInfo = (status: string) => {
    switch (status) {
      case "expert_completed":
        return {
          label: "Expert Completed",
          icon: CheckCircle2,
          styles: {
            container:
              "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
            icon: "text-green-700 dark:text-green-400",
            badge:
              "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
            iconBg: "bg-green-200 dark:bg-green-800/40",
          },
        };
      case "moderator_approved":
        return {
          label: "Moderator Approved",
          icon: UserCheck,
          styles: {
            container:
              "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 shadow-emerald-100/50",
            icon: "text-emerald-700 dark:text-emerald-400",
            badge:
              "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700",
            iconBg: "bg-emerald-200 dark:bg-emerald-800/40",
          },
        };
      case "pending":
        return {
          label: "Pending",
          icon: Clock,
          styles: {
            container:
              "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 shadow-yellow-100/50",
            icon: "text-yellow-700 dark:text-yellow-400",
            badge:
              "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700",
            iconBg: "bg-yellow-200 dark:bg-yellow-800/40",
          },
        };
      case "approved":
        return {
          label: "Approved",
          icon: CheckCircle2,
          styles: {
            container:
              "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
            icon: "text-green-700 dark:text-green-400",
            badge:
              "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
            iconBg: "bg-green-200 dark:bg-green-800/40",
          },
        };
      case "rejected":
        return {
          label: "Rejected",
          icon: AlertCircle,
          styles: {
            container:
              "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 shadow-red-100/50",
            icon: "text-red-700 dark:text-red-400",
            badge:
              "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700",
            iconBg: "bg-red-200 dark:bg-red-800/40",
          },
        };
      case "modified":
        return {
          label: "Modified",
          icon: RefreshCcw,
          styles: {
            container:
              "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 shadow-orange-100/50",
            icon: "text-orange-700 dark:text-orange-400",
            badge:
              "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700",
            iconBg: "bg-orange-200 dark:bg-orange-800/40",
          },
        };
      case "waiting":
        return {
          label: "Waiting",
          icon: RefreshCcw,
          styles: {
            container:
              "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 shadow-blue-100/50",
            icon: "text-blue-700 dark:text-blue-400",
            badge:
              "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700",
            iconBg: "bg-blue-200 dark:bg-blue-800/40",
          },
        };
      case "expert_rejected":
        return {
          label: "Request Rejected",
          icon: ExpertIcon,
          styles: {
            container:
              "bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-zinc-200/50",
            icon: "text-zinc-900 dark:text-zinc-100",
            badge:
              "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-400 dark:border-zinc-600",
            iconBg: "bg-zinc-300 dark:bg-zinc-700/70",
          },
        };
      case "moderator_rejected":
        return {
          label: "Request Rejected",
          icon: ModeratorIcon,
          styles: {
            container:
              "bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-zinc-200/50",
            icon: "text-zinc-900 dark:text-zinc-100",
            badge:
              "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-400 dark:border-zinc-600",
            iconBg: "bg-zinc-300 dark:bg-zinc-700/70",
          },
        };
      default:
        return {
          label: "Unknown",
          icon: AlertCircle,
          styles: {
            container:
              "bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700 shadow-gray-100/50",
            icon: "text-gray-700 dark:text-gray-400",
            badge:
              "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 border border-gray-300 dark:border-gray-700",
            iconBg: "bg-gray-200 dark:bg-gray-800/40",
          },
        };
    }
  };

  const formatDate = (dateString?: string | Date | null): string => {
    if (!dateString) return "";

    const date =
      typeof dateString === "string" ? new Date(dateString) : dateString;

    if (isNaN(date.getTime())) return "";

    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="w-full space-y-6 my-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Users className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-foreground">
            Question Reroute Timeline
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Total Reroutes: {reroutes.length}
          </p>
        </div>
      </div>
      <div className="w-full h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent my-4"></div>

      {/* Timeline Grid */}
      {reroutes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-gray-50 dark:bg-gray-900/10">
          <AlertCircle className="w-10 h-10 text-gray-400 mb-3" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">
            No Reroutes Yet
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            This question has not been rerouted to any experts yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 transition-all duration-500 ease-in-out">
          {displayedReroutes.map((reroute, index) => {
            const statusInfo = getStatusInfo(reroute.status);
            const StatusIcon = statusInfo.icon;
            const isLast = index === displayedReroutes.length - 1;
            const uniqueId = `${reroute.reroutedTo._id}-${index}`;

            return (
              <div
                key={uniqueId}
                className="relative flex flex-col items-center justify-center my-4 group"
              >
                {/* Arrow between cards */}
                {!isLast && (
                  <div className="absolute top-50 right-36 md:top-1/2 md:right-0 flex items-center transform translate-x-full -translate-y-1/2">
                    <svg
                      className="w-5 h-5 ml-1 text-gray-300 dark:text-gray-600 hidden md:block"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 12h14m0 0l-4-4m4 4l-4 4"
                      />
                    </svg>
                    <svg
                      className="w-5 h-5 ml-1 text-gray-300 dark:text-gray-600 block md:hidden"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 5v14m0 0l4-4m-4 4l-4-4"
                      />
                    </svg>
                  </div>
                )}

                {/* Card with flip effect */}
                <div
                  className="relative w-45 h-45 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44"
                  style={{ perspective: "1000px" }}
                  onMouseEnter={() => handleMouseEnter(uniqueId)}
                  onMouseLeave={handleMouseLeave}
                >
                  <div
                    className={`relative w-full h-full transition-transform duration-700 ${
                      isFlipped && flippedId === uniqueId
                        ? "[transform:rotateY(180deg)]"
                        : ""
                    }`}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    {/* Front of card */}
                    <div
                      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 
                        rounded-full border-2 transition-all duration-300 hover:shadow-lg hover:scale-105 
                        ${statusInfo.styles.container}`}
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${statusInfo.styles.iconBg}`}
                      >
                        <StatusIcon
                          className={`w-6 h-6 ${statusInfo.styles.icon}`}
                        />
                      </div>

                      <div className="text-center w-full px-2">
                        {currentUser.role == "expert" ? (
                          <p className="text-xs font-semibold">
                            Reviewer {index + 1}
                          </p>
                        ) : (
                          <div>
                            <p
                              className="text-xs font-semibold text-gray-900 dark:text-white truncate"
                              title={reroute.reroutedTo.firstName}
                            >
                              {reroute.reroutedTo.firstName?.slice(0, 15)}
                              {reroute.reroutedTo.firstName?.length > 15
                                ? "..."
                                : ""}
                            </p>
                            <p
                              className="text-[10px] text-gray-600 dark:text-gray-400 truncate mt-0.5"
                              title={reroute.reroutedTo.email}
                            >
                              {reroute.reroutedTo.email?.slice(0, 23)}
                              {reroute.reroutedTo.email?.length > 23
                                ? "..."
                                : ""}
                            </p>
                          </div>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${statusInfo.styles.badge}`}
                      >
                        {statusInfo.label}
                      </span>
                    </div>

                    {/* Back of card */}
                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-lg transition-all duration-300"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                      }}
                    >
                      <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-blue-400/60 to-blue-400/20" />
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          Rerouted by
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {currentUser.role == "expert"
                            ? "Moderator"
                            : reroute.reroutedBy.firstName}
                        </p>
                        <p className="text-[10px] text-gray-500 dark:text-gray-500">
                          {formatDate(reroute.reroutedAt)}
                        </p>
                        {reroute.rejectionReason && (
                          <p className="text-[10px] text-gray-500 dark:text-gray-500 italic mt-1">
                            "{reroute.rejectionReason}"
                          </p>
                        )}
                        <div className="h-0.5 w-6 rounded-full bg-gradient-to-r from-blue-400/20 to-blue-400/60" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* View More/Less Button */}
      {hasMore && (
        <div className="flex justify-center pt-4">
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-2 min-w-[160px] px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                View Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                View More ({reroutes.length - INITIAL_DISPLAY_COUNT})
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
