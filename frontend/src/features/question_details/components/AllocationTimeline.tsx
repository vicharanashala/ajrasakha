import { useRemoveAllocation } from "@/hooks/api/question/useRemoveAllocation";
import type {
  IQuestionFullData,
  ISubmission,
  ISubmissionHistory,
  IUser,
} from "@/types";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AllocationQueueHeader } from "./AllocationQueueHeader";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  PlusCircle,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { Button } from "@/components/atoms/button";

interface AllocationTimelineProps {
  queue: ISubmission["queue"];
  history: ISubmission["history"];
  currentUser: IUser;
  question: IQuestionFullData;
}

export const AllocationTimeline = ({
  currentUser,
  queue,
  history,
  question,
}: AllocationTimelineProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const INITIAL_DISPLAY_COUNT = 12;
  const [isFlipped, setIsFlipped] = useState(false);
  const [flippedId, setIsFlippedId] = useState("");
  const [hoverTimeout, setHoverTimeout] = useState<NodeJS.Timeout | null>(null);

  const [selectedAllocationIndex, setSelectedAllocationIndex] = useState<
    number | null
  >(null);
  // Remove Allocation Hook
  const { mutateAsync: removeAllocation, isPending: removingAllocation } =
    useRemoveAllocation();

  // let timer: NodeJS.Timeout;

  const handleMouseEnter = (id: string) => {
    const timeout = setTimeout(() => {
      setIsFlippedId(id);
      setIsFlipped(true);
    }, 1000); // 1 second delay
    setHoverTimeout(timeout);
  };

  const handleMouseLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
    setIsFlippedId("");
    setIsFlipped(false);
  };

  const getUserSubmission = (
    userId: string
  ): ISubmissionHistory | undefined => {
    return history.find((h) => h.updatedBy?._id === userId);
  };

  const getUserActivityText = (userId: string): string => {
    const submission = getUserSubmission(userId);
    if (!submission) return "No activity yet.";

    const userName = submission?.updatedBy?.name || "User";

    if (
      submission.answer &&
      !submission.rejectedAnswer &&
      !submission.approvedAnswer
    ) {
      return `${userName} created an answer.`;
    }

    if (submission?.approvedAnswer) {
      const approvedEntry = history.find(
        (h) => h.answer?._id === submission.approvedAnswer
      );
      const approvedUserName = approvedEntry?.updatedBy?.name || "someone";
      return `${userName} approved ${approvedUserName}'s answer.`;
    }

    if (submission?.modifiedAnswer) {
      const approvedEntry = history.find(
        (h) => h.answer?._id === submission.approvedAnswer
      );
      const approvedUserName = approvedEntry?.updatedBy?.name || "someone";
      return `${userName} modified ${approvedUserName}'s answer.`;
    }

    if (submission.rejectedAnswer) {
      const rejectedEntry = history.find(
        (h) => h.answer?._id === submission.rejectedAnswer
      );
      const rejectedUserName = rejectedEntry?.updatedBy?.name || "someone";
      return `${userName} rejected ${rejectedUserName}'s answer and created a new answer.`;
    }

    if (
      submission.status === "in-review" &&
      !submission.answer &&
      !submission.approvedAnswer &&
      !submission.rejectedAnswer
    ) {
      const reviewingEntry = history.find(
        (h) => h.answer && h.status !== "rejected" && h.status !== "approved"
      );
      const reviewingUserName = reviewingEntry?.updatedBy?.name || "someone";
      return `${userName} is currently reviewing ${reviewingUserName}'s answer.`;
    }

    return `${userName} has no recent activity.`;
  };

  useEffect(() => {
    return () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    };
  }, [hoverTimeout]);

  const handleRemoveAllocation = useCallback(
    async (index: number) => {
      try {
        setSelectedAllocationIndex(index);
        await removeAllocation({ questionId: question._id, index });
        toast.success("Allocation removed successfully.");
      } catch (error) {
        console.error("Error removing allocation:", error);
        toast.error("Error removing allocation. Please try again.");
      } finally {
        setSelectedAllocationIndex(null);
      }
    },
    [question._id, removeAllocation]
  );

  const submittedUserIds = new Set(
    history
      .filter((entry) => entry.answer || entry.status == "reviewed")
      .map((entry) => entry.updatedBy?._id)
  );

  const submittedUserEmails = new Set(
    history
      .filter((entry) => entry.answer || entry.status == "reviewed")
      .map((entry) => entry.updatedBy?.email)
  );

  // const unSubmittedExpertsCount = queue?.filter(
  //   (q) => !submittedUserIds.has(q._id) && !submittedUserEmails.has(q.email)
  // ).length;

  const nextWaitingIndex = queue?.findIndex(
    (q) => !submittedUserIds.has(q._id) && !submittedUserEmails.has(q.email)
  );
  const getStatus = (index: number) => {
    const user = queue[index];
    const activityText = getUserActivityText(user._id);
    const hasSubmitted =
      submittedUserIds.has(user._id) || submittedUserEmails.has(user.email);

    if (hasSubmitted) {
      if (activityText.includes("created an answer")) {
        return "answerCreated";
      }
      if (activityText.includes("approved")) {
        return "approved";
      }
      if (activityText.includes("rejected")) {
        return "rejected";
      }
      if (activityText.includes("modified")) {
        return "modified";
      }
      return "submitted";
    }

    if (index === nextWaitingIndex) return "waiting";
    return "pending";
  };

  const displayedQueue = isExpanded
    ? queue
    : queue?.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMore = queue?.length > INITIAL_DISPLAY_COUNT;

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "answerCreated":
        return {
          container:
            "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 shadow-yellow-100/50",
          icon: "text-yellow-700 dark:text-yellow-400",
          badge:
            "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700",
          iconBg: "bg-yellow-200 dark:bg-yellow-800/40",
          legendDot: "bg-yellow-500",
        };
      case "approved":
        return {
          container:
            "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
          icon: "text-green-700 dark:text-green-400",
          badge:
            "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
          iconBg: "bg-green-200 dark:bg-green-800/40",
          legendDot: "bg-green-500",
        };
      case "rejected":
        return {
          container:
            "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 shadow-red-100/50",
          icon: "text-red-700 dark:text-red-400",
          badge:
            "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700",
          iconBg: "bg-red-200 dark:bg-red-800/40",
          legendDot: "bg-red-500",
        };
      case "modified":
        return {
          container:
            "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 shadow-orange-100/50",
          icon: "text-orange-700 dark:text-orange-400",
          badge:
            "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700",
          iconBg: "bg-orange-200 dark:bg-orange-800/40",
          legendDot: "bg-orange-500",
        };
      case "waiting":
        return {
          container:
            "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 shadow-blue-100/50",
          icon: "text-blue-700 dark:text-blue-400",
          badge:
            "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700",
          iconBg: "bg-blue-200 dark:bg-blue-800/40",
          legendDot: "bg-blue-500",
        };
      case "pending":
        return {
          container: "bg-muted/50 border-muted shadow-muted/5",
          icon: "text-muted-foreground",
          badge: "bg-muted/50 text-muted-foreground border border-muted",
          iconBg: "bg-muted",
          legendDot: "bg-muted-foreground/40",
        };
      default:
        return {
          container: "bg-muted/50 border-muted shadow-muted/5",
          icon: "text-muted-foreground",
          badge: "bg-muted/50 text-muted-foreground border border-muted",
          iconBg: "bg-muted",
          legendDot: "bg-muted-foreground/40",
        };
    }
  };

  return (
    <div className="w-full space-y-6 my-6">
      <AllocationQueueHeader
        queue={queue}
        question={question}
        currentUser={currentUser}
      />
      {!displayedQueue || displayedQueue.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
          <div className="flex flex-col items-center gap-3 max-w-sm">
            <AlertCircle className="w-10 h-10 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">
              No Experts Allocated
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              This question is currently in a state where no experts are
              assigned to review or answer it. Please allocate experts to allow
              responses and reviews to proceed.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6   transition-all duration-500 ease-in-out">
          {displayedQueue?.map((user, index) => {
            const status = getStatus(index);
            const styles = getStatusStyles(status);
            const isLast = index === displayedQueue?.length - 1;
            const isCurrentUserWaiting =
              status === "waiting" && currentUser.email === user.email;

            return (
              <div
                key={`${user._id}-${index}`}
                className="relative flex flex-col items-center justify-center my-4 group"
              >
                {!isLast && (
                  <div className="absolute top-50 right-36 md:top-1/2 md:right-0 flex items-center transform translate-x-full -translate-y-1/2">
                    <svg
                      className={`w-5 h-5 ml-1 text-gray-300 dark:text-gray-600 hidden md:block ${
                        isCurrentUserWaiting ? "animate-bounce" : ""
                      }`}
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
                      className={`w-5 h-5 ml-1 text-gray-300 dark:text-gray-600 block md:hidden ${
                        isCurrentUserWaiting ? "animate-bounce" : ""
                      }`}
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

                {/* Overlay for delete */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="absolute w-58 h-48 rounded-md bg-card/80 border opacity-0 group-hover:opacity-30 transition-opacity duration-300"></div>

                  {!(
                    submittedUserIds.has(user._id) ||
                    submittedUserEmails.has(user.email)
                  ) &&
                    !question.isAutoAllocate && (
                      <div className="absolute -top-1 right-3 w-6 h-6 flex items-center justify-center cursor-pointer pointer-events-auto hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                        <ConfirmationModal
                          title="Remove Expert Allocation?"
                          description={`${
                            question.isAutoAllocate
                              ? " Since auto-allocation is enabled , the system will automatically allocate the next available expert immediately after removal. "
                              : ""
                          }${
                            submittedUserIds.has(user._id)
                              ? "The selected expert has already submitted an answer. "
                              : ""
                          }Are you sure you want to remove ${
                            user?.name
                          }'s allocation? This action cannot be undone. `}
                          confirmText="Remove"
                          cancelText="Cancel"
                          type="delete"
                          isLoading={removingAllocation}
                          onConfirm={() => handleRemoveAllocation(index)}
                          trigger={
                            <div className="w-6 h-6 bg-black/10 dark:bg-white/10 backdrop-blur-sm rounded-md flex items-center justify-center cursor-pointer hover:text-red-500">
                              <Trash2 className="w-4 h-4 transition-colors duration-300" />
                            </div>
                          }
                        />
                      </div>
                    )}
                </div>

                <div
                  className="relative w-42 h-42 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44"
                  style={{ perspective: "1000px" }}
                  onMouseEnter={() => handleMouseEnter(user._id)}
                  onMouseLeave={handleMouseLeave}
                >
                  <div
                    className={`relative w-full h-full transition-transform duration-700 ${
                      isFlipped && flippedId == user._id
                        ? "[transform:rotateY(180deg)]"
                        : ""
                    }`}
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div
                      className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 
            rounded-full border-2 transition-all duration-300 hover:shadow-lg hover:scale-105 
            ${styles.container} 
            ${
              isExpanded && index >= INITIAL_DISPLAY_COUNT
                ? "animate-fade-in"
                : ""
            } 
            ${
              isCurrentUserWaiting
                ? "ring-4 ring-blue-400 ring-offset-2 dark:ring-blue-600 dark:ring-offset-gray-900 scale-105"
                : ""
            }`}
                      style={{ backfaceVisibility: "hidden" }}
                    >
                      {removingAllocation &&
                        selectedAllocationIndex === index && (
                          <div className="absolute inset-0 bg-black/20 backdrop-blur-sm rounded-full flex items-center justify-center">
                            <Loader2 className="w-6 h-6 animate-spin text-white/80" />
                          </div>
                        )}
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${styles.iconBg}`}
                      >
                        {status === "answerCreated" ? (
                          <PlusCircle className={`w-6 h-6 ${styles.icon}`} />
                        ) : status === "approved" ? (
                          <CheckCircle2 className={`w-6 h-6 ${styles.icon}`} />
                        ) : status === "rejected" ? (
                          <RefreshCcw className={`w-6 h-6 ${styles.icon}`} />
                        ) : status === "waiting" ? (
                          <Clock
                            className={`w-6 h-6 ${styles.icon} ${
                              isCurrentUserWaiting
                                ? "animate-bounce-subtle"
                                : ""
                            }`}
                          />
                        ) : (
                          <AlertCircle className={`w-6 h-6 ${styles.icon}`} />
                        )}
                      </div>

                      <div className="text-center w-full px-2">
                        <p
                          className="text-xs font-semibold text-foreground truncate"
                          title={user.name}
                        >
                          {user.name?.slice(0, 15)}
                          {user.name?.length > 15 ? "..." : ""}
                        </p>
                        <p
                          className="text-[10px] text-muted-foreground truncate mt-0.5"
                          title={user.email}
                        >
                          {user.email && user.email?.slice(0, 23)}
                          {user.email && user.email?.length > 23 ? "..." : ""}
                        </p>
                      </div>

                      <span
                        className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${styles.badge}`}
                      >
                        {status === "answerCreated"
                          ? "Answer Created"
                          : status === "approved"
                            ? "Approved"
                            : status === "modified"
                              ? "Modified"
                              : status === "rejected"
                                ? "Rejected"
                                : status === "waiting"
                                  ? isCurrentUserWaiting
                                    ? "Your Turn"
                                    : "Waiting"
                                  : "Pending"}
                      </span>
                    </div>

                    <div
                      className="absolute inset-0 flex items-center justify-center rounded-lg border border-border/50 bg-gradient-to-br from-card to-card/95 shadow-lg transition-all duration-300"
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)",
                        boxShadow:
                          "0 20px 25px -5px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      <div className="flex flex-col items-center justify-center gap-2 px-4 text-center">
                        <div className="h-1 w-8 rounded-full bg-gradient-to-r from-primary/60 to-primary/20" />
                        <p
                          className="text-sm font-semibold leading-relaxed text-foreground"
                          title={getUserActivityText(user._id)}
                        >
                          {getUserActivityText(user._id)}
                        </p>
                        <div className="h-0.5 w-6 rounded-full bg-gradient-to-r from-primary/20 to-primary/60" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            onClick={() => setIsExpanded(!isExpanded)}
            className="gap-2 min-w-[160px] transition-all duration-300"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-4 h-4" />
                View Less
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                View More ({queue?.length - INITIAL_DISPLAY_COUNT})
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
};
