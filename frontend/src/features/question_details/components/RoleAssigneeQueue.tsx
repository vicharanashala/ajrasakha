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
import { toast } from "sonner";
import { ConfirmationModal } from "@/components/confirmation-modal";
import { useGetAllUsers } from "@/hooks/api/user/useGetAllUsers";
import {
  useChangeRoleAssignee,
  useRemoveRoleAssignee,
  useToggleRoleAllocation,
} from "@/hooks/api/question/useRoleAssignee";
import {
  UserCheck,
  UserX,
  CalendarClock,
  CheckCheck,
  Loader2,
  Trash2,
  User,
  UserPlus,
  X,
} from "lucide-react";

type Role = "gate_keeper" | "auditor";

interface RoleAssigneeQueueProps {
  title: string;
  /** Lower-case noun, e.g. "gate keeper". */
  noun: string;
  role: Role;
  question: IQuestionFullData;
  currentUser: IUser;
}

/**
 * Role queue section for the question detail page — mirrors the Moderator Queue:
 * a header with an auto-allocate toggle, the assigned-person node (hover-flips to a
 * timeline), a remove control, and a reassign modal. Management controls are for
 * moderators / admins only.
 */
export const RoleAssigneeQueue = ({
  title,
  noun,
  role,
  question,
  currentUser,
}: RoleAssigneeQueueProps) => {
  const isGK = role === "gate_keeper";
  const assignee = isGK
    ? question.assigned_gate_keeper
    : question.assigned_auditor;
  const assignedAt = isGK
    ? question.gateKeeperAssignedAt
    : question.auditorAssignedAt;
  const finishedAt = isGK
    ? question.gateKeeperFinishedAt
    : question.auditorFinishedAt;
  // Auto-allocate is ON unless explicitly false (default true on new questions).
  const autoAllocate =
    (isGK ? question.autoAllocateGateKeeper : question.autoAllocateAuditor) !==
    false;

  const canManage =
    currentUser.role === "moderator" || currentUser.role === "admin";

  // Manual select/remove is only relevant while the question is actually in this
  // role's handling statuses (gate keeper: dynamic/duplicate/queue_duplicate;
  // auditor: auditor_review). Outside those, only the auto-allocate toggle shows so
  // a moderator can still turn allocation on/off ahead of time.
  const roleStatuses = isGK
    ? ["dynamic", "duplicate", "queue_duplicate"]
    : ["auditor_review"];
  const isRoleStatus = roleStatuses.includes(question.status);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const queryClient = useQueryClient();
  const { mutateAsync: toggleAllocation, isPending: isToggling } =
    useToggleRoleAllocation();
  const { mutate: changeAssignee, isPending: changing } =
    useChangeRoleAssignee();
  const { mutate: removeAssignee, isPending: removing } =
    useRemoveRoleAssignee();
  const { data: usersData, isLoading: usersLoading } = useGetAllUsers({
    enabled: isModalOpen,
  });

  const candidates = useMemo(() => {
    const term = searchTerm.toLowerCase();
    return (usersData?.users ?? [])
      .filter((u) => u.role === role)
      .filter(
        (u) =>
          !term ||
          u.userName?.toLowerCase().includes(term) ||
          u.email?.toLowerCase().includes(term),
      );
  }, [usersData, role, searchTerm]);

  const assigned = !!assignee?.name;

  const handleToggle = async (next: boolean) => {
    let toastId;
    try {
      toastId = toast.loading(`Turning auto allocation ${next ? "on" : "off"}...`);
      await toggleAllocation({ questionId: question._id, role, enabled: next });
      await queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
      toast.dismiss(toastId);
      toast.success(`${title} auto allocation turned ${next ? "on" : "off"}.`);
    } catch (error) {
      console.error(error);
      toast.dismiss(toastId);
      toast.error("Failed to update auto allocation");
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedUserId("");
    setSearchTerm("");
  };

  const handleAssign = () => {
    if (!selectedUserId) return;
    changeAssignee(
      { questionId: question._id, role, userId: selectedUserId },
      { onSuccess: closeModal },
    );
  };

  const handleRemove = () => {
    removeAssignee({ questionId: question._id, role });
  };

  return (
    <div className="w-full space-y-6 my-6">
      {/* Header */}
      <div className="flex flex-col gap-4 pb-6 border-b border-border">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <UserCheck className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {assigned ? `1 ${noun} assigned` : `No ${noun} assigned`}
              </p>
            </div>
          </div>

          {canManage && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-3 bg-card p-3 rounded-lg border border-border shadow-sm w-full sm:w-auto">
                <Switch
                  id={`auto-allocate-${role}`}
                  checked={autoAllocate}
                  disabled={isToggling}
                  onCheckedChange={handleToggle}
                />
                <Label
                  htmlFor={`auto-allocate-${role}`}
                  className="cursor-pointer font-medium text-sm flex items-center gap-2"
                >
                  {isToggling && (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                  Auto-allocate {title.replace(" Queue", "")}
                </Label>
              </div>

              {/* Manual select only when auto-allocation is OFF and the question is in
                  this role's handling status (otherwise the queue assigns automatically
                  or it's not this role's turn — just the toggle shows). */}
              {!autoAllocate && isRoleStatus && (
                <Button
                  variant="default"
                  className="gap-2 w-full sm:w-auto"
                  onClick={() => setIsModalOpen(true)}
                >
                  <UserPlus className="w-4 h-4" />
                  Select {title.replace(" Queue", "")}
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {assigned ? (
        <div className="flex flex-wrap gap-6">
          <div
            className="group relative w-42 h-42 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44"
            style={{ perspective: "1000px" }}
          >
            {canManage && !autoAllocate && isRoleStatus && (
              <div className="absolute -top-1 right-0 w-6 h-6 flex items-center justify-center cursor-pointer pointer-events-auto hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-20">
                <ConfirmationModal
                  title={`Remove ${noun}?`}
                  description={`Are you sure you want to remove ${assignee!.name}'s assignment from this question? This action cannot be undone.`}
                  confirmText="Remove"
                  cancelText="Cancel"
                  type="delete"
                  isLoading={removing}
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
              {/* FRONT */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 rounded-full border-2 border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30 transition-all duration-300 hover:shadow-lg"
                style={{ backfaceVisibility: "hidden" }}
              >
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-green-100 dark:bg-green-900/40">
                  <UserCheck className="w-6 h-6 text-green-600 dark:text-green-400" />
                </div>
                <div className="text-center w-full px-2">
                  <p
                    className="text-xs font-semibold text-foreground truncate"
                    title={assignee!.name}
                  >
                    {assignee!.name?.slice(0, 15)}
                    {assignee!.name?.length > 15 ? "..." : ""}
                  </p>
                  <p
                    className="text-[10px] text-muted-foreground truncate mt-0.5"
                    title={assignee!.email}
                  >
                    {assignee!.email?.slice(0, 23)}
                    {assignee!.email && assignee!.email.length > 23 ? "..." : ""}
                  </p>
                </div>
                <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap bg-green-500/10 text-green-600 dark:text-green-400">
                  {finishedAt ? "Completed" : "Assigned"}
                </span>
              </div>

              {/* BACK — assigned / finished timeline */}
              <div
                className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-border/50 bg-gradient-to-br from-card to-card/95 shadow-lg overflow-hidden p-2.5"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <div className="w-full space-y-1.5">
                  <div className="flex items-start gap-1.5 rounded-md bg-background/40 border border-border/30 px-1.5 py-1">
                    <CalendarClock className="w-3 h-3 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground font-medium">
                        Assigned
                      </span>
                      <span className="text-[10px] font-semibold text-foreground leading-snug break-words">
                        {assignedAt ? new Date(assignedAt).toLocaleString() : "—"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-1.5 rounded-md bg-background/40 border border-border/30 px-1.5 py-1">
                    <CheckCheck
                      className={`w-3 h-3 mt-0.5 shrink-0 ${
                        finishedAt ? "text-green-500" : "text-amber-500"
                      }`}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-[8px] uppercase tracking-wide text-muted-foreground font-medium">
                        Finished
                      </span>
                      <span className="text-[10px] font-semibold text-foreground leading-snug break-words">
                        {finishedAt
                          ? new Date(finishedAt).toLocaleString()
                          : "In Progress"}
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
              No {noun} assigned
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No {noun} is currently assigned to this question. One will be
              assigned automatically when auto-allocation is on.
            </p>
          </div>
        </div>
      )}

      {/* Select / reassign modal */}
      <Dialog open={isModalOpen} onOpenChange={(o) => (o ? setIsModalOpen(true) : closeModal())}>
        <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] p-4">
          <DialogHeader className="space-y-4">
            <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
              <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-primary" />
              </div>
              Select {title.replace(" Queue", "")}
            </DialogTitle>
            <div className="mt-1 relative">
              <Input
                type="text"
                placeholder={`Search ${noun}s by name, email...`}
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
              {usersLoading && (
                <div className="flex justify-center items-center py-10 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading {noun}s...
                </div>
              )}
              {!usersLoading && candidates.length === 0 && (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <UserPlus className="w-8 h-8 mb-2 text-muted-foreground/80" />
                  <p className="text-sm font-medium">No {noun}s available</p>
                </div>
              )}
              {!usersLoading &&
                candidates.map((u) => {
                  const isSelected = selectedUserId === u._id;
                  return (
                    <Label
                      key={u._id}
                      htmlFor={`role-${u._id}`}
                      className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${
                        isSelected ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted/50"
                      }`}
                    >
                      <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                        <User className="w-5 h-5 text-primary" />
                      </div>
                      <input
                        id={`role-${u._id}`}
                        type="radio"
                        name={`role-${role}`}
                        checked={isSelected}
                        onChange={() => setSelectedUserId(u._id)}
                        className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={u.userName}>
                          {u.userName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate" title={u.email}>
                          {u.email}
                        </div>
                      </div>
                    </Label>
                  );
                })}
            </div>
          </ScrollArea>

          <DialogFooter className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!selectedUserId || changing}>
              {changing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {changing ? "Assigning..." : `Assign ${title.replace(" Queue", "")}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
