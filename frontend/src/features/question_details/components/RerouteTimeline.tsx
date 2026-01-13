import type { IRerouteHistoryResponse, IUser } from "@/types";
import { AlertCircle, ChevronDown, ChevronUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { getStatusInfo } from "../constants/rerouteStatusConfig";
import { formatDate } from "../utils/formatDate";

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
