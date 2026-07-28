import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { IQuestionFullData, IUser } from "@/types";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Switch } from "@/components/atoms/switch";
import { useChangeModerator } from "@/hooks/api/question/useChangeModerator";
import { useRemoveModerator } from "@/hooks/api/question/useRemoveModerator";
import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";
import { toast } from "sonner";
import { useGetStfModerators } from "@/hooks/api/user/useGetStfModerators";
import { BLOCKING_ASSIGNED_STATUSES } from "@/hooks/services/userService";
import { ConfirmationModal } from "@/components/confirmation-modal";
import {
  CalendarClock,
  CheckCheck,
  Clock,
  Info,
  Loader2,
  Trash2,
  User,
  UserCheck,
  UserPlus,
  UserX,
  X,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { formatDuration } from "../utils/formatDate";

interface ModeratorQueueProps {
  question: IQuestionFullData;
  currentUser: IUser;
}

/**
 * "Moderator Queue" section — mirrors the Allocation Queue header style and sits
 * just below it. Shows the moderator the question is currently assigned to (set by
 * the moderator-queue cron) as a circular node, and lets moderators/admins reassign
 * it (single-select modal, styled like "Select Experts Manually") while the question
 * is still in-review or re-routed.
 */
export const ModeratorQueue = ({ question, currentUser }: ModeratorQueueProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedModId, setSelectedModId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: stfModerators, isLoading: stfModeratorsLoading } =
    useGetStfModerators(isModalOpen);
  const { mutate: changeModerator, isPending: changingModerator } =
    useChangeModerator();
  const { mutate: removeModerator, isPending: removingModerator } =
    useRemoveModerator();

  // Moderator auto-allocation toggle is ON only when BOTH fields exist in the DB and
  // are explicitly true. If either is missing/false, the toggle shows OFF.
  const autoAllocateModerator = question.autoAllocateModerator === true;
  const { mutateAsync: updateQuestion, isPending: isTogglingAutoAllocate } =
    useUpdateQuestion();
  const queryClient = useQueryClient();

  const handleToggleAutoAllocateModerator = async (next: boolean) => {
    let toastId;
    try {
      toastId = toast.loading(`Turning auto allocation ${next ? "on" : "off"}...`);
      await updateQuestion({ _id: question._id, autoAllocateModerator: next });
      // Refresh the question detail data so the toggle/UI reflects the new value
      // immediately — same as the expert auto-allocate toggle.
      await queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
      toast.dismiss(toastId);
      toast.success(`Moderator auto allocation turned ${next ? "on" : "off"}.`);
    } catch (error) {
      console.error(error);
      toast.dismiss(toastId);
      toast.error("Failed to update auto allocation");
    }
  };

  const filteredModerators = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (stfModerators ?? []).filter(
      (m) =>
        m.name?.toLowerCase().includes(term) ||
        m.email?.toLowerCase().includes(term)
    );
  }, [stfModerators, searchTerm]);

  // Only moderators/admins see this section.
  if (currentUser.role !== "moderator" && currentUser.role !== "admin") {
    return null;
  }

  const assignedModerator = question.assigned_moderator;

  // A moderator is relevant once the question reaches the review stage, or when it is
  // a duplicate (duplicates are also assigned to moderators). Until then
  // (draft/open/pae_submitted/etc.) hide the "Select Moderator" action.
  const canSelectModerator =
    question.status === "in-review" ||
    question.status === "re-routed" ||
    question.status === "duplicate";

  // Closed → the moderation is finalized (green). Otherwise it's still pending (amber).
  const isClosed = question.status === "closed";

  // Moderator handling timeline (shown on hover-flip, mirroring the expert queue):
  // assigned when the moderator was set, completed when the question was closed,
  // and the duration between the two. Still open → "In Progress".
  const moderatorAssignedAt = question.moderatorAssignedAt ?? null;
  const moderatorCompletedAt = isClosed ? question.closedAt ?? null : null;
  const moderatorTimeTakenMs =
    moderatorAssignedAt && moderatorCompletedAt
      ? new Date(moderatorCompletedAt).getTime() -
        new Date(moderatorAssignedAt).getTime()
      : null;
  const nodeStyles = isClosed
    ? {
        container:
          "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30",
        iconBg: "bg-green-100 dark:bg-green-900/40",
        icon: "text-green-600 dark:text-green-400",
        badge: "bg-green-500/10 text-green-600 dark:text-green-400",
        label: "Finalized",
      }
    : {
        container:
          "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
        iconBg: "bg-amber-100 dark:bg-amber-900/40",
        icon: "text-amber-600 dark:text-amber-400",
        badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
        label: "Assigned",
      };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedModId("");
    setSearchTerm("");
  };

  const handleAssign = () => {
    if (!selectedModId) return;
    changeModerator(
      { questionId: question._id, moderatorId: selectedModId },
      { onSuccess: closeModal }
    );
  };

  const handleRemove = () => {
    removeModerator({ questionId: question._id });
  };

  return (
    <div className="w-full space-y-6 my-6">
      {/* Header — same treatment as the Allocation Queue header */}
      <div className="flex flex-col gap-4 pb-6 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* LEFT SECTION */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <UserCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">
                Moderator Queue
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {assignedModerator?.name
                  ? "1 moderator assigned"
                  : "No moderator assigned"}
              </p>
            </div>
          </div>

          {/* RIGHT SECTION — Auto-allocate toggle + Select moderator. */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Auto Allocate toggle — controls whether the moderator-queue cron may
                auto-assign this question to a moderator. Styled to match the
                "Auto-allocate Experts" block in the Allocation Queue header. */}
            <div className="flex items-center gap-3 bg-card p-3 rounded-lg border border-border shadow-sm w-full sm:w-auto">
              <Switch
                id="auto-allocate-moderator"
                checked={autoAllocateModerator}
                disabled={isTogglingAutoAllocate}
                onCheckedChange={handleToggleAutoAllocateModerator}
              />
              <Label
                htmlFor="auto-allocate-moderator"
                className="cursor-pointer font-medium text-sm flex items-center gap-2"
              >
                {isTogglingAutoAllocate && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
                Auto-allocate Moderator
              </Label>

              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <div className="space-y-1.5 text-sm">
                      <p>
                        <strong>ON:</strong> This question is auto-assigned to an
                        available moderator by the queue.
                      </p>
                      <p>
                        <strong>OFF:</strong> This question is never auto-assigned to
                        a moderator.
                      </p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            {/* Select moderator. Shown only when auto-allocation is OFF (otherwise the
                queue assigns a moderator automatically), and once the question has
                reached the review stage (in-review / re-routed). */}
            {!autoAllocateModerator && canSelectModerator && (
              <Button
                variant="default"
                className="gap-2 w-full sm:w-auto"
                onClick={() => setIsModalOpen(true)}
              >
                <UserPlus className="w-4 h-4" />
                Select Moderator
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Assigned moderator — circular node, same style as the expert allocation cards.
          On hover the card flips to reveal the moderation timeline (assigned / completed
          / duration), mirroring the expert queue. */}
      {assignedModerator?.name ? (
        <div className="flex flex-wrap gap-6">
          <div
            className="group relative w-42 h-42 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44"
            style={{ perspective: "1000px" }}
          >
            {/* Remove moderator — hover-revealed trash icon, mirrors the expert allocation removal.
                Sits outside the flipping element so it stays put. Hidden once the question is
                finalized (closed), and only available when auto-allocation is OFF (manual mode). */}
            {!isClosed && !autoAllocateModerator && (
              <div className="absolute -top-1 right-0 w-6 h-6 flex items-center justify-center cursor-pointer pointer-events-auto hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                <ConfirmationModal
                  title="Remove Moderator?"
                  description={`Are you sure you want to remove ${assignedModerator.name}'s assignment from this question? This action cannot be undone.`}
                  confirmText="Remove"
                  cancelText="Cancel"
                  type="delete"
                  isLoading={removingModerator}
                  onConfirm={handleRemove}
                  trigger={
                    <div className="w-6 h-6 bg-black/10 dark:bg-white/10 backdrop-blur-sm rounded-md flex items-center justify-center cursor-pointer hover:text-red-500">
                      <Trash2 className="w-4 h-4 transition-colors duration-300" />
                    </div>
                  }
                />
              </div>
            )}

            <div
              className="relative w-full h-full transition-transform duration-700 group-hover:[transform:rotateY(180deg)]"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* FRONT — assigned moderator node */}
              <div
                className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 rounded-full border-2 transition-all duration-300 hover:shadow-lg ${nodeStyles.container}`}
                style={{ backfaceVisibility: "hidden" }}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center ${nodeStyles.iconBg}`}
                >
                  <UserCheck className={`w-6 h-6 ${nodeStyles.icon}`} />
                </div>

                <div className="text-center w-full px-2">
                  <p
                    className="text-xs font-semibold text-foreground truncate"
                    title={assignedModerator.name}
                  >
                    {assignedModerator.name?.slice(0, 15)}
                    {assignedModerator.name?.length > 15 ? "..." : ""}
                  </p>
                  <p
                    className="text-[10px] text-muted-foreground truncate mt-0.5"
                    title={assignedModerator.email}
                  >
                    {assignedModerator.email?.slice(0, 23)}
                    {assignedModerator.email?.length > 23 ? "..." : ""}
                  </p>
                </div>

                <span
                  className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${nodeStyles.badge}`}
                >
                  {nodeStyles.label}
                </span>
              </div>

              {/* BACK — moderation timeline */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border/50 bg-gradient-to-br from-card to-card/95 shadow-lg overflow-hidden p-2.5"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <div className="w-full space-y-1.5">
                  {/* Assigned at */}
                  <div className="flex items-start gap-1.5 rounded-md bg-background/40 border border-border/30 px-1.5 py-1">
                    <CalendarClock className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground font-medium">
                        Assigned
                      </span>
                      <span className="text-[10px] font-semibold text-foreground leading-snug break-words">
                        {moderatorAssignedAt
                          ? new Date(moderatorAssignedAt).toLocaleString()
                          : "—"}
                      </span>
                    </div>
                  </div>

                  {/* Completed at (closed) — otherwise still in progress */}
                  <div className="flex items-start gap-1.5 rounded-md bg-background/40 border border-border/30 px-1.5 py-1">
                    <CheckCheck
                      className={`w-3 h-3 mt-0.5 shrink-0 ${
                        moderatorCompletedAt ? "text-green-500" : "text-amber-500"
                      }`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground font-medium">
                        Completed
                      </span>
                      <span className="text-[10px] font-semibold text-foreground leading-snug break-words">
                        {moderatorCompletedAt
                          ? new Date(moderatorCompletedAt).toLocaleString()
                          : "In Progress"}
                      </span>
                    </div>
                  </div>

                  {/* Duration */}
                  <div className="flex items-start gap-1.5 rounded-md bg-primary/5 border border-primary/10 px-1.5 py-1">
                    <Clock className="w-3 h-3 text-primary mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground font-medium">
                        Duration
                      </span>
                      <span className="text-[10px] font-bold text-primary leading-snug">
                        {moderatorTimeTakenMs
                          ? formatDuration(moderatorTimeTakenMs)
                          : "Ongoing"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
          <div className="flex flex-col items-center gap-3 max-w-sm">
            <UserX className="w-10 h-10 text-muted-foreground" />
            <h3 className="text-base font-semibold text-foreground">
              No Moderator Assigned
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No moderator is currently assigned to review this question. One will
              be assigned automatically, or you can assign one manually.
            </p>
          </div>
        </div>
      )}

      {/* Select-moderator modal — same layout as "Select Experts Manually" (single-select) */}
      <Dialog open={isModalOpen} onOpenChange={(open) => (open ? setIsModalOpen(true) : closeModal())}>
        <DialogContent
          className="
            w-[95vw]
            sm:max-w-xl
            md:max-w-2xl
            max-h-[90vh]
            p-4
          "
        >
          <DialogHeader className="space-y-4">
            <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
              <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              Select Moderator
            </DialogTitle>

            <div className="mt-1 relative">
              <Input
                type="text"
                placeholder="Search moderators by name, email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary border"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm("")}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] md:max-h-[55vh] pr-2">
            <div className="space-y-3">
              {stfModeratorsLoading && (
                <div className="flex justify-center items-center py-10 text-muted-foreground">
                  <div className="flex flex-col items-center space-y-2">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm">Loading moderators...</span>
                  </div>
                </div>
              )}

              {!stfModeratorsLoading && filteredModerators.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <UserPlus className="w-8 h-8 mb-2 text-muted-foreground/80" />
                  <p className="text-sm font-medium">No moderators available</p>
                  <p className="text-xs text-muted-foreground">
                    Try refreshing or check back later.
                  </p>
                </div>
              )}

              {!stfModeratorsLoading &&
                filteredModerators.map((mod) => {
                  const isSelected = selectedModId === mod._id;
                  // Busy only if holding a question in a blocking status (in-review /
                  // duplicate). Re-routed (and other) held questions don't count.
                  const blockingCount =
                    mod.assignedQuestionIds?.filter((a) =>
                      BLOCKING_ASSIGNED_STATUSES.includes(a.status),
                    ).length ?? 0;
                  return (
                    <Label
                      key={mod._id}
                      htmlFor={`mod-${mod._id}`}
                      className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-primary/10 ring-1 ring-primary/40"
                          : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>

                      <input
                        id={`mod-${mod._id}`}
                        type="radio"
                        name="moderator"
                        checked={isSelected}
                        onChange={() => setSelectedModId(mod._id)}
                        className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                      />

                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={mod.name}>
                          {mod.name}
                        </div>
                        <div
                          className="text-xs text-muted-foreground truncate"
                          title={mod.email}
                        >
                          {mod.email}
                        </div>
                      </div>

                      {/* Availability — busy only when holding a blocking-status question */}
                      <span
                        className={`shrink-0 self-center text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                          blockingCount
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            : "bg-green-500/10 text-green-600 dark:text-green-400"
                        }`}
                      >
                        {blockingCount
                          ? `Assigned (${blockingCount})`
                          : "Available"}
                      </span>
                    </Label>
                  );
                })}
            </div>
          </ScrollArea>

          <DialogFooter className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={closeModal} className="md:block">
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedModId || changingModerator}>
              {changingModerator && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {changingModerator ? "Assigning..." : "Assign Moderator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
