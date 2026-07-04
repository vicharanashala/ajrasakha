import type { IQuestionFullData, IUser } from "@/types";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { TimerDisplay } from "@/components/timer-display";
import { formatDate } from "@/utils/formatDate";
import { buildHoldCountdownOptions } from "@/hooks/ui/useCountdown";
import { useQuestionTimer } from "@/hooks/ui/useQuestionTimer";
import { getTimerStartTime } from "@/utils/getTimerStartTime";
import SarvamTranslateDropdown from "@/components/SarvamTranslateDropdown";
import { useState } from "react";
import { useHoldQuestion } from "@/hooks/api/question/useHoldQuestion";
import { useManualCheckDuplicate } from "@/hooks/api/question/useManualCheckDuplicate";
import { toast } from "sonner";
import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";
import { useConfirmDuplicate } from "@/hooks/api/answer/useConfirmDuplicate";
import { Textarea } from "@/components/atoms/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/atoms/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/atoms/dialog";
import { CircleCheck, GitCompareArrows, History } from "lucide-react";
import { diffWords } from "@/utils/wordDifference";
import { AuditTrailModal } from "./AuditTrailModal";
import { isEnglishCharacters } from "@/features/questions/utils/checkLanguage";
import { QuestionLifecycleTable } from "@/features/chatbotDashboard/QuestionLifeCycle";
import { useSelectedQuestion } from "@/hooks/api/question/useSelectedQuestion";

interface QuestionHeaderProps {
  question: IQuestionFullData;
  goBack: () => void;
  currentUser: IUser;
  isQuestionAllocatedToExpert: boolean;
}

export const QuestionHeader = ({ question, goBack, currentUser, isQuestionAllocatedToExpert }: QuestionHeaderProps) => {
  //translation state
  const [translatedText, setTranslatedText] = useState<string>("");

  const isDuplicate = Boolean(
    question?.similarityScore &&
    question?.referenceQuestionId &&
    question?.referenceQuestion &&
    question?.referenceSource
  );

  // Get correct timer start time based on user role (Author vs Level Expert)
  const timerStartTime = getTimerStartTime(question);

  const { timer } = useQuestionTimer(
    question.source,
    timerStartTime,
    buildHoldCountdownOptions(question)
  );
  const [duplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [auditModalOpen, setAuditModalOpen] = useState(false);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    type: "hold" | "unhold";
  }>({
    open: false,
    type: "hold",
  });
  const { mutateAsync: holdQuestion } = useHoldQuestion();
  const handleHold = () => {
    if (!question?._id) return;
    setConfirmDialog({ open: true, type: question.isOnHold ? "unhold" : "hold", });
  };
  const doHold = async () => {
    try {
      await holdQuestion({
        questionId: question._id!,
        action: question.isOnHold ? "unhold" : "hold",
      });
      toast.success(`Question ${question.isOnHold ? "released from hold" : "put on hold"} successfully`);
      goBack();
    } catch (error) {
      console.error(error);
      toast.error("Failed to hold question");
    }
  };
  const handleConfirm = () => {
    setConfirmDialog({ open: false, type: "hold" });
    doHold();
  };
  const isQuestionOnHold = question.isOnHold;
  const { mutate: checkDuplicate, isPending: isCheckingDuplicate } = useManualCheckDuplicate();
  const originalQuestion = question.originalQuestion?.trim();
  const { view, setView } = useSelectedQuestion();

  // "Closed by" label. For system-closed questions (e.g. queue-duplicate children
  // auto-closed when their parent closed) show the acting moderator's name with a
  // "(System)" suffix, since the close was performed by the system on their behalf.
  const closedByName = question.approved_moderator?.name || "Unknown";
  const closedByLabel =
    question.closedBy === "System" ? `${closedByName} (System)` : closedByName;

  // ─── Cancel / Confirm Duplicate (assigned gate keeper only) ────────────────
  // Both actions are only offered to the gate keeper this question is currently
  // assigned to (server-computed to avoid ObjectId serialization mismatches).
  const isAssignedGateKeeper = Boolean(question.isAssignedGateKeeper);
  const isDuplicateCancelled = Boolean(question.isDuplicateCancelled);
  const [cancelDuplicateOpen, setCancelDuplicateOpen] = useState(false);
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);
  const { mutateAsync: confirmDuplicate, isPending: isConfirmingDuplicate } =
    useConfirmDuplicate();

  const handleConfirmDuplicate = async () => {
    let toastId;
    try {
      toastId = toast.loading("Confirming duplicate...");
      const res = await confirmDuplicate(question._id!);
      toast.dismiss(toastId);
      toast.success(
        res?.closed
          ? "Duplicate confirmed. The reference question is already closed, so this question was closed and the user will be notified."
          : "Duplicate confirmed. This question will close automatically once the reference question is closed."
      );
      setConfirmDuplicateOpen(false);
      goBack();
    } catch (error) {
      console.error(error);
      toast.dismiss(toastId);
      toast.error("Failed to confirm duplicate");
    }
  };

  const [cancelReason, setCancelReason] = useState("");
  // null = not chosen yet; the moderator must confirm whether to turn auto-allocation on.
  const [autoAllocate, setAutoAllocate] = useState<boolean | null>(null);
  const { mutateAsync: updateQuestion, isPending: isCancellingDuplicate } = useUpdateQuestion();

  const resetCancelDuplicate = () => {
    setCancelReason("");
    setAutoAllocate(null);
  };

  const handleCancelDuplicate = async () => {
    const reason = cancelReason.trim();
    if (!reason) {
      toast.error("Please provide a reason for cancelling the duplicate.");
      return;
    }
    if (autoAllocate === null) {
      toast.error("Please choose whether to turn on auto allocation.");
      return;
    }
    let toastId;
    try {
      toastId = toast.loading("Cancelling duplicate...");
      await updateQuestion({
        _id: question._id,
        status: "open",
        isDuplicateCancelled: true,
        duplicateCancelReason: reason,
        isAutoAllocate: autoAllocate,
      });
      toast.dismiss(toastId);
      toast.success("Duplicate cancelled. Question reopened. Please refresh the page to see updated changes.");
      setCancelDuplicateOpen(false);
      resetCancelDuplicate();
    } catch (error) {
      console.error(error);
      toast.dismiss(toastId);
      toast.error("Failed to cancel duplicate");
    }
  };

  // For compare mode: reference answer (from the original/reference question)
  const referenceAnswerText = (() => {
    const text = question.referenceQuestionData?.text;
    if (!text) return null;
    const match = text.match(/answer:\s*([\s\S]+)/i);
    return match ? match[1].trim() : null;
  })();

  const finalAnswer = question.closedFinalAnswer;

  // Fallback: last history entry with an answer (used when closedFinalAnswer is absent)
  const lastHistoryWithAnswer = [...(question?.submission?.history || [])]
    .sort((a, b) => new Date(a.updatedAt ?? 0).getTime() - new Date(b.updatedAt ?? 0).getTime())
    .reverse()
    .find((h) => h.answer !== null);

  // Use closedFinalAnswer when present; fall back to submission history
  const currentAnswerText = finalAnswer?.answer ?? lastHistoryWithAnswer?.answer?.answer ?? "";
  const currentAnswerSources = finalAnswer?.sources ?? lastHistoryWithAnswer?.answer?.sources ?? [];

  const sortedHistory = [...(question?.submission?.history || [])].sort(
    (a, b) =>
      new Date(a.updatedAt ?? "").getTime() -
      new Date(b.updatedAt ?? "").getTime()
  );

  const latestHistory =
    sortedHistory.length > 0
      ? sortedHistory[sortedHistory.length - 1]
      : null;

  const diffMs =
    latestHistory && question?.closedAt
      ? new Date(question.closedAt).getTime() -
        new Date(latestHistory.updatedAt ?? "").getTime()
      : null;

  // When moderatorAssignedAt is present, compute a separate TAT using that timestamp
  const moderatorDiffMs =
    question?.moderatorAssignedAt && question?.closedAt
      ? new Date(question.closedAt).getTime() -
        new Date(question.moderatorAssignedAt).getTime()
      : null;

  const formatMs = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const milliseconds = ms % 1000;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return [
      hours > 0 ? `${hours} hour${hours !== 1 ? "s" : ""}` : null,
      minutes > 0 ? `${minutes} minute${minutes !== 1 ? "s" : ""}` : null,
      `${seconds} second${seconds !== 1 ? "s" : ""}`,
      `${milliseconds} ms`,
    ].filter(Boolean).join(" ");
  };

  const formattedTime = diffMs !== null && diffMs > 0 ? formatMs(diffMs) : "N/A";
  const moderatorFormattedTime = moderatorDiffMs !== null && moderatorDiffMs > 0 ? formatMs(moderatorDiffMs) : "N/A";

  return (
    <>
      <header className="grid gap-3 w-full">
        {/* Title + Timer + Exit */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl font-semibold text-pretty break-words">
              {translatedText || question.question}
            </h1>
            {originalQuestion && (
              <p className="mt-1 text-sm sm:text-base text-muted-foreground break-words">
                ({originalQuestion})
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-start sm:justify-end sm:flex-shrink-0">
            <div className="flex flex-wrap justify-end gap-2">
              {currentUser.role != "expert" &&
                currentUser.role !== "tester" &&
                isQuestionAllocatedToExpert &&
                question.status !== "closed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleHold}
                    className="whitespace-nowrap"
                  >
                    {isQuestionOnHold ? "Release Hold" : "Hold the question"}
                  </Button>
                )}
              {
                question.question?.trim() && !isEnglishCharacters(question.question) && (
                  <SarvamTranslateDropdown
                    query={question.question}
                    onTranslate={(result) => setTranslatedText(result)}
                  />
                )
              }
            </div>

            <div className="flex sm:flex-row flex-col sm:items-center items-end gap-3 sm:gap-6">
              {/* <TimerDisplay timer={timer} status={question.status} size="lg" /> */}
              {question.status !== "pass" && (
                <TimerDisplay
                  timer={timer}
                  status={question.status}
                  source={question.source}
                  size="lg"
                />
              )}

              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant="outline"
                  className="inline-flex items-center justify-center gap-1 whitespace-nowrap p-2"
                  onClick={goBack}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                    stroke="currentColor"
                    className="w-4 h-4"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                  <span className="leading-none">Exit</span>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Status + Priority + Total answers */}
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {isDuplicate && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setDuplicateModalOpen(true)}
                className="border-red-400/30 text-red-500 hover:bg-red-400/10 hover:text-red-500"
              >
                Show Reference
              </Button>
            )}
            {isDuplicate && currentUser.role === "gate_keeper" && isAssignedGateKeeper && !isDuplicateCancelled && (question.status === "queue_duplicate") && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDuplicateOpen(true)}
                  className="border-green-500/30 text-green-700 hover:bg-green-500/10 hover:text-green-700"
                >
                  Confirm Duplicate
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCancelDuplicateOpen(true)}
                  className="border-amber-400/30 text-amber-600 hover:bg-amber-400/10 hover:text-amber-600"
                >
                  Cancel Duplicate
                </Button>
              </>
            )}
            {isDuplicateCancelled && (
              <div className="flex items-center gap-1.5">
                <Badge className="bg-amber-500/10 text-amber-700 border-amber-500/30">
                  Duplicate Cancelled
                </Badge>
                <span className="text-[11px] italic text-muted-foreground">
                  To view the cancel reason, check the audit trail.
                </span>
              </div>
            )}
            {!isDuplicate && !question.referenceQuestionId && currentUser.role !== "expert" && currentUser.role !== "tester" && (
              question.isDuplicateChecked ? (
                <Badge className="bg-green-500/10 text-green-700 border-green-500/30 gap-1">
                  <CircleCheck className="h-3 w-3" />
                  No duplicate found
                </Badge>
              ) : (
                <Button
                  size="sm"
                  disabled={isCheckingDuplicate}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() =>
                    checkDuplicate(question._id!, {
                      onSuccess: (res) => {
                        toast.success(res?.message ?? "Duplicate check complete.");
                      },
                      onError: () => toast.error("Duplicate check failed"),
                    })
                  }
                >
                  {isCheckingDuplicate ? "Checking..." : "Check Duplicate"}
                </Button>
              )
            )}
            {!isDuplicate && (
              <>
                <Badge
                  className={
                    question.status === "in-review"
                      ? "bg-green-500/10 text-green-600 border-green-500/30"
                      : question.status === "open"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        : question.status === "closed"
                          ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
                          : question.status === "pae_submitted"
                            ? "bg-amber-600/10 text-amber-700 border-amber-600/30"
                            : "bg-muted text-foreground"
                  }
                >
                  {question.status.replace("_", " ")}
                </Badge>

                <Badge
                  className={
                  question.priority === "critical"
                    ? "bg-red-600/10 text-red-700 border-red-700/30"
                    : question.priority === "high"
                    ? "bg-orange-500/10 text-orange-600 border-orange-500/30"
                    : question.priority === "medium"
                    ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
                    : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                  }
                >
                  {question.priority ? question.priority.toUpperCase() : "NIL"}
                </Badge>
              </>
            )}

            <span className="text-sm text-muted-foreground whitespace-nowrap">
              Total answers: {question.totalAnswersCount}
            </span>
          </div>
          {/* {(question?.status === "closed" &&
            (currentUser.role === "moderator" ||
              currentUser.role === "admin")) && (
              <div>
                <div className="text-sm">
                  {question?.closedAt && (
                    <span>
                      The Question was closed at:{" "} {question.approved_moderator?.name} {question.approved_moderator.email}
                      {new Date(question.closedAt).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            )} */}
          {/* Only show standalone "Closed by" when moderatorAssignedAt is absent (old flow) */}
          {question?.status === "closed" &&
            (currentUser.role === "moderator" ||
              currentUser.role === "admin" ||
              currentUser.role === "tester") &&
            question?.closedAt &&
            !question?.moderatorAssignedAt && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleCheck className="h-3.5 w-3.5 text-primary" />
                <span>
                  Closed by{" "}
                  <span className="font-medium text-foreground">
                    {closedByLabel}
                  </span>
                </span>

          <span>•</span>

          <span>{new Date(question.closedAt).toLocaleString()}</span>
        </div>
      )}

          {/* View Audit Button */}
          <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setView("lifecycle")}
            className="gap-1.5"
          >
            <History className="h-4 w-4" />
            View LifeCycle
          </Button>

          {/* View Audit Button */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAuditModalOpen(true)}
            className="gap-1.5"
          >
            <History className="h-4 w-4" />
            View Audit
          </Button>
          </div>
        </div>

        {/* Created / Updated */}
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="text-xs text-muted-foreground flex flex-wrap gap-1">
            <span>Created: {formatDate(new Date(question.createdAt))}</span>
            <span>•</span>
            <span>Updated: {formatDate(new Date(question.updatedAt))}</span>
          </div>
          <div>
            {question?.status === "closed" &&
              (currentUser.role === "moderator" || currentUser.role === "admin" || currentUser.role === "tester") &&
              question?.closedAt && (
                <div className="flex flex-col gap-1 text-sm text-right">
                  {question?.moderatorAssignedAt ? (
                    <>
                      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
                        <CircleCheck className="h-3.5 w-3.5 text-primary" />
                        <span>
                          Closed by{" "}
                          <span className="font-medium text-foreground">
                            {closedByLabel}
                          </span>
                        </span>
                        <span>•</span>
                        <span>{new Date(question.closedAt).toLocaleString()}</span>
                      </div>
                      <div className="text-muted-foreground">
                        Moderator TAT:{" "}
                        <span className="font-medium text-foreground">
                          {moderatorFormattedTime}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div>
                      Moderator TAT:{" "}
                      {latestHistory && diffMs && diffMs > 0 ? formattedTime : "N/A"}
                    </div>
                  )}
                </div>
              )}
          </div>
        </div>
      </header>
      <Dialog
        open={cancelDuplicateOpen}
        onOpenChange={(open) => {
          setCancelDuplicateOpen(open);
          if (!open) resetCancelDuplicate();
        }}
      >
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Duplicate</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will reopen the question (status → open). Please provide a reason for cancelling the duplicate.
          </p>
          <Textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Reason for cancelling the duplicate..."
            className="min-h-[100px]"
          />
          <div className="space-y-1.5">
            <p className="text-sm font-medium">Do you want to turn on auto allocation?</p>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={autoAllocate === true ? "default" : "outline"}
                onClick={() => setAutoAllocate(true)}
              >
                Yes
              </Button>
              <Button
                type="button"
                size="sm"
                variant={autoAllocate === false ? "default" : "outline"}
                onClick={() => setAutoAllocate(false)}
              >
                No
              </Button>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCancelDuplicateOpen(false);
                resetCancelDuplicate();
              }}
              disabled={isCancellingDuplicate}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleCancelDuplicate}
              disabled={isCancellingDuplicate || !cancelReason.trim() || autoAllocate === null}
            >
              {isCancellingDuplicate ? "Cancelling..." : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={confirmDuplicateOpen}
        onOpenChange={setConfirmDuplicateOpen}
      >
        <DialogContent className="!max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Duplicate</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This confirms the question is a genuine duplicate of its reference
            question. If the reference question is already closed, this question
            will be closed now with the reference's answer and the user will be
            notified. Otherwise it will move to <b>duplicate confirmed</b> and
            close automatically when the reference question is closed.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmDuplicateOpen(false)}
              disabled={isConfirmingDuplicate}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              onClick={handleConfirmDuplicate}
              disabled={isConfirmingDuplicate}
            >
              {isConfirmingDuplicate ? "Confirming..." : "Confirm Duplicate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={duplicateModalOpen} onOpenChange={(open) => { setDuplicateModalOpen(open); if (!open) setCompareMode(false); }}>
        <DialogContent className="!max-w-[65vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-8">
              <DialogTitle className="text-red-500">
                Duplicate Reference Question
              </DialogTitle>
              {question.status === "closed" && (referenceAnswerText || currentAnswerText) && (
                <Button
                  size="sm"
                  variant={compareMode ? "default" : "outline"}
                  onClick={() => setCompareMode((prev) => !prev)}
                  className="gap-1.5 shrink-0"
                >
                  <GitCompareArrows size={14} />
                  Compare Answer
                </Button>
              )}
            </div>
          </DialogHeader>

          {question.referenceQuestionData ? (
            <div className="space-y-4">
              {/* Metadata */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm border rounded-md p-4 bg-muted/30">
                <div>
                  <span className="text-muted-foreground font-medium">
                    Status:{" "}
                  </span>
                  <span className="capitalize">
                    {question.referenceQuestionData.status}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">
                    Similarity:{" "}
                  </span>
                  <span>{question.similarityScore?.toFixed(1)}%</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">
                    State:{" "}
                  </span>
                  <span>{question.referenceQuestionData.details?.state}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">
                    District:{" "}
                  </span>
                  <span>
                    {question.referenceQuestionData.details?.district}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">
                    Crop:{" "}
                  </span>
                  <span>{question.referenceQuestionData.details?.crop}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">
                    Season:{" "}
                  </span>
                  <span>{question.referenceQuestionData.details?.season}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">
                    Domain:{" "}
                  </span>
                  <span>{question.referenceQuestionData.details?.domain}</span>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">
                    Source:{" "}
                  </span>
                  <span>{question.referenceSource}</span>
                </div>
              </div>

              {/* Question */}
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-1">
                  Question
                </p>
                <p className="text-sm border rounded-md p-3 bg-muted/20">
                  {question.referenceQuestionData.question}
                </p>
              </div>

              {/* Compare Answer: 2-column side-by-side */}
              {compareMode ? (() => {
                const currentText = currentAnswerText;
                const previousText = referenceAnswerText ?? "";
                const diff = diffWords(previousText, currentText);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                    {/* Column 1: Current Answer — shows added (green) words */}
                    <div className="border rounded-lg p-4 bg-muted/30 flex flex-col">
                      <p className="text-sm font-semibold text-foreground">Current Answer</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Answer submitted for this duplicate question
                      </p>
                      {currentText ? (
                        <>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">
                            {diff.map((part, idx) =>
                              part.type === "removed" ? null : (
                                <span
                                  key={idx}
                                  className={
                                    part.type === "added"
                                      ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                      : "text-dark dark:text-white"
                                  }
                                >
                                  {part.value}
                                </span>
                              )
                            )}
                          </div>
                          <div className="pt-2 border-t mt-auto">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Sources</p>
                            {currentAnswerSources.length > 0 ? (
                              <ul className="space-y-2">
                                {currentAnswerSources.map((s, i) => (
                                  <li key={i} className="text-xs flex flex-col gap-0.5">
                                    <span className="font-medium text-foreground">
                                      {i + 1}. {s.sourceName ? `${s.sourceName}${s.page != null ? ` (p. ${s.page})` : ""}` : "Source"}
                                    </span>
                                    {s.source && (
                                      /^https?:\/\//i.test(s.source) ? (
                                        <a
                                          href={s.source}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="break-all pl-3 text-primary hover:text-primary/80 hover:underline"
                                        >
                                          {s.source}
                                        </a>
                                      ) : (
                                        <span className="break-all pl-3 text-muted-foreground">{s.source}</span>
                                      )
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">No sources</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No answer available</p>
                      )}
                    </div>

                    {/* Column 2: Previous Answer — shows removed (red) words */}
                    <div className="border rounded-lg p-4 bg-muted/30 flex flex-col">
                      <p className="text-sm font-semibold text-foreground">Previous Answer</p>
                      <p className="text-xs text-muted-foreground mb-2">
                        Answer from the reference question
                      </p>
                      {previousText ? (
                        <>
                          <div className="text-sm whitespace-pre-wrap leading-relaxed">
                            {diff.map((part, idx) =>
                              part.type === "added" ? null : (
                                <span
                                  key={idx}
                                  className={
                                    part.type === "removed"
                                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                      : "text-dark dark:text-white"
                                  }
                                >
                                  {part.value}
                                </span>
                              )
                            )}
                          </div>
                          <div className="pt-2 border-t mt-auto">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Sources</p>
                            {question.referenceQuestionData?.sources && question.referenceQuestionData.sources.length > 0 ? (
                              <ul className="space-y-2">
                                {question.referenceQuestionData.sources.map((s, i) => (
                                  <li key={i} className="text-xs flex flex-col gap-0.5">
                                    <span className="font-medium text-foreground">
                                      {i + 1}. {s.sourceName ? `${s.sourceName}${s.page != null ? ` (p. ${s.page})` : ""}` : "Source"}
                                    </span>
                                    {s.source && (
                                      /^https?:\/\//i.test(s.source) ? (
                                        <a
                                          href={s.source}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="break-all pl-3 text-primary hover:text-primary/80 hover:underline"
                                        >
                                          {s.source}
                                        </a>
                                      ) : (
                                        <span className="break-all pl-3 text-muted-foreground">{s.source}</span>
                                      )
                                    )}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <p className="text-xs text-muted-foreground italic">No sources</p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">No answer available</p>
                      )}
                    </div>
                  </div>
                );
              })() : null}

              {/* Default single-column answer view when not comparing */}
              {!compareMode && referenceAnswerText && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Answer
                  </p>
                  <p className="text-sm border rounded-md p-3 bg-muted/20 whitespace-pre-wrap">
                    {referenceAnswerText}
                  </p>
                </div>
              )}

              {/* Sources from the reference question's final answer */}
              {!compareMode && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">
                    Sources
                  </p>
                  <div className="border rounded-md p-3 bg-muted/20">
                    {question.referenceQuestionData.sources && question.referenceQuestionData.sources.length > 0 ? (
                      <ul className="space-y-2">
                        {question.referenceQuestionData.sources.map((s, i) => (
                          <li key={i} className="text-sm flex flex-col gap-0.5">
                            <span className="font-medium text-foreground">
                              {i + 1}. {s.sourceName ? `${s.sourceName}${s.page != null ? ` (p. ${s.page})` : ""}` : "Source"}
                            </span>
                            {s.source && (
                              /^https?:\/\//i.test(s.source) ? (
                                <a
                                  href={s.source}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="break-all pl-4 text-xs text-primary hover:text-primary/80 hover:underline"
                                >
                                  {s.source}
                                </a>
                              ) : (
                                <span className="break-all pl-4 text-xs text-muted-foreground">
                                  {s.source}
                                </span>
                              )
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        No sources available
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Reference question:{" "}
              <span className="font-medium">{question.referenceQuestion}</span>
              <br />
              <span className="text-xs mt-1 block">
                Detailed data not available.
              </span>
            </p>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {question.isOnHold
                ? "Release this question?"
                : "Hold this question?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {question.isOnHold
                ? "Are you sure you want to release this question from hold?"
                : "Are you sure you want to put this question on hold?"}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              {question.isOnHold ? "Yes, Release" : "Yes, Hold"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <QuestionLifecycleTable
        open={view === "lifecycle"}
        onClose={() => setView(undefined)}
        questionId={question._id!}
      />

      <AuditTrailModal
        open={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        questionId={question._id!}
      />
    </>
  );
};
