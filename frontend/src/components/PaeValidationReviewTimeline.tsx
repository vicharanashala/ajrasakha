import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
    MessageSquareDiff,
    CheckCircle2,
    ChevronDown,
    Clock,
    Loader2,
    UserPlus,
    User,
    X,
    CalendarClock,
    CheckCheck,
    Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { QuestionService } from "@/hooks/services/questionService";
import { useToggleRoleAllocation } from "@/hooks/api/question/useRoleAssignee";
import { getStatusStyles } from "@/features/question_details/constants/allocationStatusStyleConfig";
import { ConfirmationModal } from "./confirmation-modal";
import { Button } from "./atoms/button";
import { Switch } from "./atoms/switch";
import { Label } from "./atoms/label";
import { Input } from "./atoms/input";
import { ScrollArea } from "./atoms/scroll-area";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./atoms/dialog";
import { useGetPaeValidationExperts } from "@/hooks/api/user/useGetPaeValidationExperts";

const qs = new QuestionService();

/**
 * Pae-validation-review timeline — same design as the Auditor / Gate Keeper queue: an
 * auto-allocate Switch, a "Select Reviewer" button (when auto is OFF) that opens a
 * modal listing all users, and the assigned reviewers as circular cards. Management
 * controls are for any non-expert user (canManage).
 */
export const PaeValidationReviewTimeline = ({
    questionId,
    canManage = false,
}: {
    questionId: string;
    canManage?: boolean;
}) => {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ["pae-validation", questionId],
        queryFn: () => qs.getPaeValidationTimeline(questionId),
        enabled: !!questionId,
    });
    const timeline = data?.data;
    // Auto-allocation is ON only when explicitly true; a missing/false field = OFF
    // (matches the backend strict rule).
    const autoOn = timeline?.autoAllocatePaeValidationExpert === true;
    const hasOpenRound = timeline?.hasOpenRound === true;

    const [isOpen, setIsOpen] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    // DB index of the round being changed (undefined = assign a new round).
    const [changeIndex, setChangeIndex] = useState<number | undefined>(undefined);

    const toggle = useToggleRoleAllocation();

    const { data: usersData, isLoading: usersLoading } = useGetPaeValidationExperts()
    const candidates = useMemo(() => {
        const term = searchTerm.toLowerCase();
        return (usersData ?? [])
            .filter(
                (u) =>
                    !term ||
                    u.name?.toLowerCase().includes(term) ||
                    u.email?.toLowerCase().includes(term),
            );
    }, [usersData, searchTerm]);

    const assign = useMutation({
        mutationFn: (userId: string) =>
            qs.assignPaeValidationReviewer(questionId, userId, changeIndex),
        onSuccess: () => {
            toast.success(
                changeIndex !== undefined ? "Reviewer changed" : "Reviewer assigned",
            );
            closeModal();
            queryClient.invalidateQueries({ queryKey: ["pae-validation", questionId] });
            queryClient.invalidateQueries({ queryKey: ["pae_validation_experts"] });
            queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
        },
        onError: (e: any) => toast.error(e?.message || "Failed to assign reviewer"),
    });

    const remove = useMutation({
        mutationFn: (index: number) => qs.removePaeValidationReviewer(questionId, index),
        onSuccess: () => {
            toast.success("Reviewer removed");
            queryClient.invalidateQueries({ queryKey: ["pae-validation", questionId] });
            queryClient.invalidateQueries({ queryKey: ["pae_validation_experts"] });
            queryClient.invalidateQueries({ queryKey: ["question_full_data"] });
        },
        onError: (e: any) => toast.error(e?.message || "Failed to remove reviewer"),
    });

    const closeModal = () => {
        setIsModalOpen(false);
        setSelectedUserId("");
        setSearchTerm("");
        setChangeIndex(undefined);
    };

    // Open the picker to change a specific round, or to assign a fresh one.
    const openPicker = (index?: number) => {
        setChangeIndex(index);
        setIsModalOpen(true);
    };

    const handleToggle = async (next: boolean) => {
        let toastId;
        try {
            toastId = toast.loading(`Turning auto allocation ${next ? "on" : "off"}...`);
            await toggle.mutateAsync({ questionId, role: "pae_validator", enabled: next });
            await queryClient.invalidateQueries({
                queryKey: ["pae-validation", questionId],
            });
            toast.dismiss(toastId);
            toast.success(`PAE Validation auto allocation turned ${next ? "on" : "off"}.`);
        } catch {
            toast.dismiss(toastId);
            toast.error("Failed to update auto allocation");
        }
    };

    if (isLoading || !timeline) return null;
    // if (!timeline.hasOpenRound && timeline.reviews.length === 0) return null;

    // "Select Reviewer" shows when auto is OFF (to assign/change), for non-experts.
    const showSelect = canManage && !autoOn;
    const openRound = timeline?.reviews.find(
        (r) => r.paeStatus === "in-progress",
    );
    const openRoundIndex = openRound?.index;

    return (
        <div className="w-full space-y-6 my-6">
            {/* Header — mirrors the role queue header */}
            <div className="flex flex-col gap-4 pb-6 border-b border-border">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div
                        onClick={() => setIsOpen((prev) => !prev)}
                        className="flex items-center gap-3 cursor-pointer select-none group"
                    >
                        <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                            <MessageSquareDiff className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold text-foreground group-hover:text-primary transition-colors">
                                Pae Validation 
                            </h2>
                            <p className="text-sm text-muted-foreground mt-1">
                                {timeline.hasOpenRound
                                    ? "Open pae validation awaiting review"
                                    : "No open pae validation"}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        {canManage && (
                            <>
                                <div className="flex items-center gap-3 bg-card p-3 rounded-lg border border-border shadow-sm w-full sm:w-auto">
                                    <Switch
                                        id="auto-allocate-feedback"
                                        checked={autoOn}
                                        disabled={toggle.isPending}
                                        onCheckedChange={handleToggle}
                                    />
                                    <Label
                                        htmlFor="auto-allocate-feedback"
                                        className="cursor-pointer font-medium text-sm flex items-center gap-2"
                                    >
                                        {toggle.isPending && (
                                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                        )}
                                        Auto-allocate Pae Validation
                                    </Label>
                                </div>

                                {showSelect && (
                                    <Button
                                        variant="default"
                                        className="gap-2 w-full sm:w-auto"
                                        onClick={() =>
                                            openPicker(hasOpenRound ? openRoundIndex : undefined)
                                        }
                                    >
                                        <UserPlus className="w-4 h-4" />
                                        {hasOpenRound
                                            ? "Change PAE Validation Expert"
                                            : "Select PAE Validation Expert"}
                                    </Button>
                                )}
                            </>
                        )}

                        <Button
                            variant="default"
                            size="sm"
                            className="h-9 mr-2 w-9 p-0 rounded-lg hover:bg-muted"
                            title={isOpen ? "Collapse" : "Expand"}
                            onClick={() => setIsOpen((prev) => !prev)}
                        >
                            <ChevronDown
                                className={cn(
                                    "h-5 w-5 transition-transform duration-300 ease-in-out",
                                    isOpen ? "rotate-180" : ""
                                )}
                            />
                        </Button>
                    </div>
                </div>
            </div>

            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        key="pae-validation-timeline-content"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{
                            height: "auto",
                            opacity: 1,
                            transition: {
                                height: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1.0] },
                                opacity: { duration: 0.25, delay: 0.05 },
                            },
                        }}
                        exit={{
                            height: 0,
                            opacity: 0,
                            transition: {
                                height: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1.0] },
                                opacity: { duration: 0.18 },
                            },
                        }}
                        className="overflow-hidden"
                    >

            {/* Assigned reviewers as circular cards */}
            {timeline.reviews.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center border border-dashed rounded-lg bg-muted/30 dark:bg-muted/10">
                    <UserPlus className="w-10 h-10 text-muted-foreground mb-2" />
                    <h3 className="text-base font-semibold text-foreground">
                        No reviewer assigned
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                        A reviewer is assigned automatically when auto-allocation is on, or pick
                        one manually.
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 transition-all duration-500 ease-in-out">
                    {timeline.reviews.map((r, index) => {
                        const done = !!r.paeFinishedAt;
                        const styles = getStatusStyles(done ? "approved" : "waiting");
                        return (
                            <div
                                key={`${r.paeId}-${r.paeAssignedAt}-${index}`}
                                className="relative flex flex-col items-center justify-center my-4 group"
                            >
                                <div
                                    className="relative w-42 h-42 sm:w-32 sm:h-32 md:w-36 md:h-36 lg:w-44 lg:h-44"
                                    style={{ perspective: "1000px" }}
                                >
                                    {/* Delete — only while the round is NOT completed. */}
                                    {canManage && !done && (
                                        <div className="absolute -top-1 right-0 w-6 h-6 flex items-center justify-center z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <ConfirmationModal
                                                title="Remove PAE validation expert?"
                                                description={`Remove ${r.paeName}'s PAE validation from this question?.`}
                                                confirmText="Remove"
                                                cancelText="Cancel"
                                                type="delete"
                                                isLoading={remove.isPending}
                                                onConfirm={() => remove.mutate(r.index)}
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
                                        {/* FRONT — reviewer circle */}
                                        <div
                                            className={`absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 rounded-full border-2 transition-all duration-300 hover:shadow-lg ${styles.container}`}
                                            style={{ backfaceVisibility: "hidden" }}
                                        >
                                            <div
                                                className={`w-12 h-12 rounded-full flex items-center justify-center ${styles.iconBg}`}
                                            >
                                                {done ? (
                                                    <CheckCircle2 className={`w-6 h-6 ${styles.icon}`} />
                                                ) : (
                                                    <Clock className={`w-6 h-6 ${styles.icon}`} />
                                                )}
                                            </div>
                                            <div className="text-center w-full px-2">
                                                <p
                                                    className="text-xs font-semibold text-foreground truncate"
                                                    title={r.paeName}
                                                >
                                                    {r.paeName?.slice(0, 15)}
                                                    {r.paeName?.length > 15 ? "..." : ""}
                                                </p>
                                                <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                                    {r.paeAssignedAt
                                                        ? new Date(r.paeAssignedAt).toLocaleDateString()
                                                        : ""}
                                                </p>
                                            </div>
                                            <span
                                                className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${styles.badge}`}
                                            >
                                                {done ? "Reviewed" : "Reviewing"}
                                            </span>
                                        </div>

                                        {/* BACK — assigned / completed timeline */}
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
                                                            {r.paeAssignedAt
                                                                ? new Date(r.paeAssignedAt).toLocaleString()
                                                                : "—"}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="flex items-start gap-1.5 rounded-md bg-background/40 border border-border/30 px-1.5 py-1">
                                                    <CheckCheck
                                                        className={`w-3 h-3 mt-0.5 shrink-0 ${done ? "text-green-500" : "text-amber-500"
                                                            }`}
                                                    />
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-[8px] uppercase tracking-wide text-muted-foreground font-medium">
                                                            Completed
                                                        </span>
                                                        <span className="text-[10px] font-semibold text-foreground leading-snug break-words">
                                                            {done && r.paeFinishedAt
                                                                ? new Date(r.paeFinishedAt).toLocaleString()
                                                                : "In Progress"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Select / change reviewer modal — all users */}
            <Dialog
                open={isModalOpen}
                onOpenChange={(o) => (o ? setIsModalOpen(true) : closeModal())}
            >
                <DialogContent className="w-[95vw] sm:max-w-xl md:max-w-2xl max-h-[90vh] p-4">
                    <DialogHeader className="space-y-4">
                        <DialogTitle className="flex items-center gap-3 text-lg font-semibold">
                            <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                                <UserPlus className="w-5 h-5 text-primary" />
                            </div>
                            {hasOpenRound ? "Change Pae Validation Reviewer" : "Select Pae Validation Reviewer"}
                        </DialogTitle>
                        <div className="mt-1 relative">
                            <Input
                                type="text"
                                placeholder="Search users by name, email..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full px-3 py-2 rounded-md text-sm border"
                            />
                            {searchTerm && (
                                <button
                                    type="button"
                                    onClick={() => setSearchTerm("")}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
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
                                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading users...
                                </div>
                            )}
                            {!usersLoading && candidates.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                                    <UserPlus className="w-8 h-8 mb-2 text-muted-foreground/80" />
                                    <p className="text-sm font-medium">No users available</p>
                                </div>
                            )}
                            {!usersLoading &&
                                candidates.map((u) => {
                                    const isSelected = selectedUserId === u._id;
                                    return (
                                        <Label
                                            key={u._id}
                                            htmlFor={`fb-${u._id}`}
                                            className={`flex items-start space-x-3 p-3 rounded-lg cursor-pointer transition-colors ${isSelected
                                                    ? "bg-primary/10 ring-1 ring-primary/40"
                                                    : "hover:bg-muted/50"
                                                }`}
                                        >
                                            <div className="p-2 rounded-lg bg-primary/10 flex items-center justify-center">
                                                <User className="w-5 h-5 text-primary" />
                                            </div>
                                            <input
                                                id={`fb-${u._id}`}
                                                type="radio"
                                                name="feedback-reviewer"
                                                checked={isSelected}
                                                onChange={() => setSelectedUserId(u._id)}
                                                className="mt-1 h-4 w-4 accent-primary cursor-pointer"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium truncate" title={u.name}>
                                                    {u.name}
                                                </div>
                                                <div
                                                    className="text-xs text-muted-foreground truncate"
                                                    title={u.email}
                                                >
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
                        <Button
                            onClick={() => selectedUserId && assign.mutate(selectedUserId)}
                            disabled={!selectedUserId || assign.isPending}
                        >
                            {assign.isPending && (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            )}
                            {assign.isPending
                                ? "Assigning..."
                                : hasOpenRound
                                    ? "Change Reviewer"
                                    : "Assign Reviewer"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default PaeValidationReviewTimeline;
