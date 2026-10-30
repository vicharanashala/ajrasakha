import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
    BellIcon,
    CheckCircle,
    Clock,
    X,
    Settings2,
    ChevronDown,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetTrigger,
} from "@/components/atoms/sheet";
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/atoms/collapsible";
import { Button } from "@/components/atoms/button";
import { ScrollArea } from "@/components/atoms/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/atoms/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/atoms/tooltip";
import { useGetNotifications } from "@/hooks/api/notification/useGetNotifications";
import { useDeleteNotification } from "@/hooks/api/notification/useDeleteNotifications";
import { useMarkAsReadNotification } from "@/hooks/api/notification/useUpdateNotification";
import { useMarkAllAsReadNotification } from "@/hooks/api/notification/useMarkAllAsRead";
import { useAutoDeletePreference } from "@/hooks/api/user/useAutoDeleteNotifications";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { toast } from "sonner";
import { formatDate } from "@/utils/formatDate";
import {
    useNavigateToComment,
    useNavigateToQuestion,
    useNavigateToRequest,
    useNavigateToHistory,
    useNavigateToPopQueue,
    useNavigateToMainTable
} from "@/hooks/api/question/useNavigateToQuestion";
import { cn } from "@/lib/utils";
import { useToast } from "@/shared/components/toast";

export interface Notification {
    _id: string;
    enitity_id: string;
    message: string;
    title: string;
    is_read: boolean;
    type: string;
    createdAt: string;
    questionText?: string;
    sender?: {
        _id: string;
        name?: string;
        email?: string;
        role?: string;
    } | null;
    recipient?: {
        _id: string;
        name?: string;
        email?: string;
        role?: string;
    } | null;
}

interface NotificationModalProps {
    trigger: React.ReactNode;
    copy?: "notifications" | "messages";
}

export function NotificationModal({ trigger, copy = "notifications" }: NotificationModalProps) {
    const { success: toastSuccess, error: toastError} = useToast();
    const queryClient = useQueryClient();
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const { data: user } = useGetCurrentUser();
    const {
        data: notificationPages,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
    } = useGetNotifications();

    const { mutateAsync: deleteNotification } = useDeleteNotification();
    const { mutateAsync: markAsRead } = useMarkAsReadNotification();
    const { mutateAsync: markAllAsRead } = useMarkAllAsReadNotification();
    const { mutateAsync: autoDeletePreference } = useAutoDeletePreference();

    const { goToQuestion } = useNavigateToQuestion();
    const { goToRequest } = useNavigateToRequest();
    const { goToComment } = useNavigateToComment();
    const { goToHistory } = useNavigateToHistory();
    const { goToPopQueue } = useNavigateToPopQueue();
    const { goToMainTable } = useNavigateToMainTable();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [deletePreference, setDeletePreference] = useState("never");

    useEffect(() => {
        if (user?.notificationRetention) {
            setDeletePreference(user.notificationRetention);
        }
    }, [user]);

    useEffect(() => {
        if (notificationPages?.pages) {
            const allNotifications = notificationPages?.pages.flatMap(
                (page) => page?.notifications ?? []
            );
            setNotifications(allNotifications);
        }
    }, [notificationPages]);

    // Two independent, genuinely reliable local cues that a pop-queue notification was probably
    // just created, each re-arming the same 3x10s burst below instead of polling nonstop:
    //   1. service-worker.js's push handler posts this to every open tab the instant the OS-level
    //      push notification arrives. Reliable for SOME transitions, but confirmed NOT for others
    //      (e.g. admin decline -> approver never gets this postMessage) — that's why this can't be
    //      the only trigger.
    //   2. "pop-queue-changed", dispatched by DocumentManagementPanel.tsx's SSE `upload` handler —
    //      the exact same event that makes the queue list itself update instantly on screen, for
    //      every queue-level change (approve/decline/add-new/GridFS arrival). Unrelated to push,
    //      so it's unaffected by push's reliability gap, but only fires while that panel is
    //      mounted (i.e. the recipient is on the PoP dashboard page right now).
    // Burst, not a single invalidate, because one invalidate can race the backend write it's
    // reacting to — 3 tries 10s apart gives it room to catch up either way.
    useEffect(() => {
        const invalidate = () => {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
            queryClient.invalidateQueries({ queryKey: ["user"] });
        };
        let timers: ReturnType<typeof setTimeout>[] = [];
        const burst = () => {
            invalidate();
            timers.forEach(clearTimeout);
            timers = [10000, 20000].map((delay) => setTimeout(invalidate, delay));
        };
        const swHandler = (event: MessageEvent) => {
            if (event.data?.type === "new-notification") burst();
        };
        const queueHandler = () => burst();
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.addEventListener("message", swHandler);
        }
        window.addEventListener("pop-queue-changed", queueHandler);
        return () => {
            if ("serviceWorker" in navigator) {
                navigator.serviceWorker.removeEventListener("message", swHandler);
            }
            window.removeEventListener("pop-queue-changed", queueHandler);
            timers.forEach(clearTimeout);
        };
    }, [queryClient]);

    const filteredNotifications = notifications.filter((n) => {
        if (filter === "unread") return !n.is_read;
        if (filter === "read") return n.is_read;
        return true;
    });

    const unreadCount = notifications.filter((n) => !n.is_read).length;
    const isMessagesCopy = copy === "messages";
    const titleText = isMessagesCopy ? "Messages" : "Notifications";
    const itemText = isMessagesCopy ? "messages" : "notifications";
    const emptyTitleText = isMessagesCopy ? "No messages" : "No notifications";

    const handleNotificationClick = async (notification: Notification) => {
        const { type, enitity_id, _id } = notification;
        await markAsRead(_id);
        setOpen(false);

        if (type === "answer_creation" || type === "peer_review" || type === "re-routed" ||
            type === "question_from_whatsapp" || type === "question_from_ajrasakha" || type === 'question_delayed' ||
            type === 'moderator_approval') {
            goToQuestion(enitity_id, type);
            return;
        }
        if (type === "flag") {
            goToRequest(enitity_id);
            return;
        }
        if (type === "comment" || type === "flag_response") {
            goToComment(enitity_id);
            return;
        }
        if (["review_rejected", "review_modified", "re-routed-answer-created", "re-routed-rejected-expert", "re-routed-rejected-moderator"].includes(type)) {
            goToHistory(enitity_id);
            return;
        }
        if (["pop_pending_approval", "pop_pending_admin_review", "pop_upload_rejected"].includes(type)) {
            goToPopQueue();
            return;
        }
        if (type === "pop_document_published") {
            // The message carries the ANNAM id in quotes (see the backend's notifyPopEvent) — copy
            // it so the user can paste it straight into the Main Table's Document ID filter.
            const annamId = extractQuotedId(notification.message);
            if (annamId) {
                navigator.clipboard?.writeText(annamId).catch(() => {});
                toastSuccess(`Copied ${annamId} — paste it into the Document ID filter`);
            }
            goToMainTable();
            return;
        }
    };

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
            toastSuccess("All notifications marked as read!");
        } catch (error) {
            console.error("Error: ", error);
        }
    };

    const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation();
        setNotifications((prev) => prev.filter((n) => n._id !== notificationId));
        try {
            await deleteNotification(notificationId);
            toast.success("Notification deleted");
        } catch (error) {
            console.error("Error: ", error);
        }
    };

    const handlePreferenceChange = async (value: string) => {
        setDeletePreference(value);
        try {
            await autoDeletePreference(value);
            toast.success("Preference Updated");
        } catch (error) {
             toastError("Error updating Preference");
        }
    };

    return (
        <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
                {trigger}
            </SheetTrigger>
            <SheetContent
                side="right"
                className="p-0 border-l bg-background shadow-2xl h-[calc(100vh-2rem)] my-4 mr-4 rounded-2xl flex flex-col w-full sm:max-w-md overflow-hidden"
            >
                <SheetHeader className="p-6 pb-2 shrink-0">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="bg-primary/10 p-2 rounded-xl">
                                <BellIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <SheetTitle className="text-xl font-bold">{titleText}</SheetTitle>
                                <p className="text-sm text-muted-foreground">
                                    {notifications.length} total, {unreadCount} new
                                </p>
                            </div>
                        </div>
                    </div>
                </SheetHeader>

                <div className="px-6 py-2 shrink-0 border-b">
                    <Collapsible
                        open={isSettingsOpen}
                        onOpenChange={setIsSettingsOpen}
                        className="w-full"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground hover:text-foreground">
                                    <Settings2 className="w-4 h-4 mr-2" />
                                    Filter & Settings
                                    <ChevronDown className={cn("ml-2 h-4 w-4 transition-transform duration-200", isSettingsOpen && "rotate-180")} />
                                </Button>
                            </CollapsibleTrigger>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleMarkAllAsRead}
                                disabled={unreadCount === 0}
                                className="text-muted-foreground hover:text-foreground text-xs h-8"
                            >
                                <CheckCircle className="w-3.5 h-3.5 mr-1 text-primary" />
                                Mark all read
                            </Button>
                        </div>

                        <CollapsibleContent className="space-y-4 py-2">
                            <div className="flex bg-primary/5 border border-primary/20 p-1 rounded-lg w-fit">
                                <button
                                    onClick={() => setFilter("all")}
                                    className={cn(
                                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                        filter === "all" ? "bg-primary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    All
                                </button>
                                <button
                                    onClick={() => setFilter("unread")}
                                    className={cn(
                                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1.5",
                                        filter === "unread" ? "bg-primary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Unread
                                    {unreadCount > 0 && (
                                        <span className="bg-primary/25 text-primary-foreground px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                            {unreadCount}
                                        </span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setFilter("read")}
                                    className={cn(
                                        "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                                        filter === "read" ? "bg-primary text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                                    )}
                                >
                                    Read
                                </button>
                            </div>

                            <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
                                <Clock className="w-4 h-4 text-primary" />
                                <span className="text-xs font-medium text-foreground">Auto-delete after:</span>
                                <Select onValueChange={handlePreferenceChange} value={deletePreference}>
                                    <SelectTrigger className="h-7 w-28 text-xs bg-transparent border-none shadow-none focus:ring-0 text-foreground">
                                        <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="3d">3 days</SelectItem>
                                        <SelectItem value="1w">1 week</SelectItem>
                                        <SelectItem value="2w">2 weeks</SelectItem>
                                        <SelectItem value="1m">1 month</SelectItem>
                                        <SelectItem value="never">Never</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>

                <ScrollArea className="flex-1 bg-muted/10">
                    <div className="p-6 flex flex-col gap-4">
                        <AnimatePresence initial={false}>
                            {filteredNotifications.length === 0 ? (
                                <motion.div
                                    key="empty-notifications"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    transition={{ duration: 0.2 }}
                                    className="flex flex-col items-center justify-center py-20 text-center"
                                >
                                    <div className="bg-muted p-4 rounded-full mb-4">
                                        <BellIcon className="w-8 h-8 text-muted-foreground" />
                                    </div>
                                    <h3 className="font-semibold text-lg">{emptyTitleText}</h3>
                                    <p className="text-sm text-muted-foreground">You're all caught up!</p>
                                </motion.div>
                            ) : (
                                filteredNotifications.map((n) => (
                                    <motion.div
                                        key={n._id}
                                        layout
                                        initial={{ opacity: 0, y: 8, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{
                                            opacity: 0,
                                            x: 40,
                                            scale: 0.92,
                                            transition: { duration: 0.22, ease: "easeOut" }
                                        }}
                                        transition={{
                                            layout: { duration: 0.25, ease: "easeInOut" },
                                            opacity: { duration: 0.18 },
                                            y: { duration: 0.18 }
                                        }}
                                        onClick={() => handleNotificationClick(n)}
                                        className={cn(
                                            "flex gap-4 p-4 rounded-xl border bg-card transition-colors cursor-pointer group hover:shadow-md hover:border-primary/50 relative",
                                            !n.is_read && "border-l-4 border-l-primary shadow-sm"
                                        )}
                                    >
                                        <div className="shrink-0">
                                            <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center relative">
                                                <BellIcon className="w-5 h-5 text-primary" />
                                                {!n.is_read && (
                                                    <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-card" />
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between mb-1">
                                                <h4
                                                    className="font-bold text-sm text-foreground break-words pr-2"
                                                    title={getNotificationDisplayTitle(n)}
                                                >
                                                    {getNotificationDisplayTitle(n)}
                                                </h4>
                                            </div>
                                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                                                {n.message}
                                            </p>
                                            {n.type === "pop_document_published" && extractQuotedId(n.message) && (
                                                <p
                                                    className="text-xs text-primary font-semibold bg-primary/5 px-2 py-1.5 rounded-md mb-3 border border-primary/20"
                                                    title="Click to copy and open the Main Table"
                                                >
                                                    ANNAM ID: {extractQuotedId(n.message)}
                                                </p>
                                            )}
                                            {n.questionText && (
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <p className="text-xs text-primary font-medium bg-primary/5 px-2 py-1.5 rounded-md line-clamp-2 leading-relaxed mb-3 border border-primary/20 cursor-help">
                                                                {n.questionText}
                                                            </p>
                                                        </TooltipTrigger>
                                                        <TooltipContent side="bottom" className="max-w-sm">
                                                            <p className="text-sm">{n.questionText}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                </TooltipProvider>
                                            )}
                                            <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium">
                                                <div className="flex items-center gap-1">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDate(new Date(n.createdAt))}
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={(e) => handleDelete(e, n._id)}
                                            title="Delete notification"
                                            className="p-1.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground rounded-lg transition-all duration-200 hover:scale-110 active:scale-90 hover:rotate-90 self-start"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </motion.div>
                                ))
                            )}
                        </AnimatePresence>

                        {hasNextPage && (
                            <Button
                                variant="outline"
                                className="w-full text-xs h-10 border-dashed"
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                            >
                                {isFetchingNextPage ? "Loading..." : `View previous ${itemText}`}
                            </Button>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 bg-muted/20 text-center shrink-0 border-t">
                    <p className="text-xs font-semibold text-muted-foreground">
                        {unreadCount} {itemText} require your attention
                    </p>
                </div>
            </SheetContent>
        </Sheet>
    );
}

// Pulls the quoted ANNAM id back out of a pop_document_published message (built server-side as
// `"${itemName}" was added to the document database.`, see NotificationService.notifyPopEvent) —
// there's no dedicated field for it on the notification, just this one quoted token in the text.
function extractQuotedId(message: string): string | null {
    return message?.match(/"([^"]+)"/)?.[1] || null;
}

function getNotificationDisplayTitle(notification: Notification) {
    const senderName = notification.sender?.name || notification.sender?.email;

    if (
        senderName &&
        (notification.title === "Message from coordinator" ||
            notification.title === "Message from admin")
    ) {
        return `Message from ${senderName}`;
    }

    if (
        notification.sender?.role === "admin" &&
        notification.title === "Message from coordinator"
    ) {
        return "Message from admin";
    }

    return notification.title || "Update Received";
}
