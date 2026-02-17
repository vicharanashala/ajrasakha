import { useState, useEffect } from "react";
import {
    BellIcon,
    CheckCircle,
    Clock,
    User,
    AlertTriangle,
    Zap,
    X
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { ScrollArea } from "@/components/atoms/scroll-area";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/atoms/select";
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
    useNavigateToHistory
} from "@/hooks/api/question/useNavigateToQuestion";
import { cn } from "@/lib/utils";

export interface Notification {
    _id: string;
    enitity_id: string;
    message: string;
    title: string;
    is_read: boolean;
    type: string;
    createdAt: string;
}

interface NotificationModalProps {
    trigger: React.ReactNode;
}

export function NotificationModal({ trigger }: NotificationModalProps) {
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
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

    const filteredNotifications = notifications.filter((n) => {
        if (filter === "unread") return !n.is_read;
        if (filter === "read") return n.is_read;
        return true;
    });

    const unreadCount = notifications.filter((n) => !n.is_read).length;

    const handleNotificationClick = async (notification: Notification) => {
        const { type, enitity_id, _id } = notification;
        await markAsRead(_id);
        setOpen(false);

        if (type === "answer_creation" || type === "peer_review" || type === "re-routed") {
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
    };

    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead();
            toast.success("All notifications marked as read!");
        } catch (error) {
            console.error("Error: ", error);
        }
    };

    const handleDelete = async (e: React.MouseEvent, notificationId: string) => {
        e.stopPropagation();
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
            toast.error("Error updating Preference");
        }
    };

    const getNotificationIcon = (type: string) => {
        switch (type) {
            case "answer_creation":
            case "re-routed-answer-created":
                return <User className="w-5 h-5 text-primary" />;
            case "flag":
                return <AlertTriangle className="w-5 h-5 text-destructive" />;
            case "comment":
                return <Zap className="w-5 h-5 text-primary" />;
            default:
                return <BellIcon className="w-5 h-5 text-muted-foreground" />;
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger}
            </DialogTrigger>
            <DialogContent className="max-w-md p-0 overflow-hidden sm:rounded-2xl border-none shadow-2xl sm:left-auto sm:right-20 sm:top-20 sm:translate-x-0 sm:translate-y-0 translate-y-0 top-20">
                <DialogHeader className="p-5 pb-2">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <div className="bg-primary/10 p-2 rounded-xl">
                                <BellIcon className="w-5 h-5 text-primary" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold">Notifications</DialogTitle>
                                <p className="text-sm text-muted-foreground">
                                    {notifications.length} total, {unreadCount} new
                                </p>
                            </div>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-5 py-2">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex bg-primary/10 p-1 rounded-lg">
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

                        <div className="flex items-center gap-2">
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
                    </div>

                    <div className="flex items-center gap-2 mb-4 p-2 bg-primary/5 rounded-lg border border-primary/20">
                        <Clock className="w-4 h-4 text-primary" />
                        <span className="text-xs font-medium text-primary-foreground">Auto-delete after:</span>
                        <Select onValueChange={handlePreferenceChange} value={deletePreference}>
                            <SelectTrigger className="h-7 w-28 text-xs bg-transparent border-none shadow-none focus:ring-0 text-primary-foreground">
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
                </div>

                <ScrollArea className="h-[400px] border-t border-b bg-muted/10">
                    <div className="p-5 space-y-4">
                        {filteredNotifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center">
                                <div className="bg-muted p-4 rounded-full mb-4">
                                    <BellIcon className="w-8 h-8 text-muted-foreground" />
                                </div>
                                <h3 className="font-semibold text-lg">No notifications</h3>
                                <p className="text-sm text-muted-foreground">You're all caught up!</p>
                            </div>
                        ) : (
                            filteredNotifications.map((n) => (
                                <div
                                    key={n._id}
                                    onClick={() => handleNotificationClick(n)}
                                    className={cn(
                                        "flex gap-4 p-4 rounded-xl border bg-card transition-all cursor-pointer group hover:shadow-md hover:border-primary/50",
                                        !n.is_read && "border-l-4 border-l-primary shadow-sm"
                                    )}
                                >
                                    <div className="shrink-0">
                                        <div className="w-12 h-12 rounded-xl bg-muted/30 flex items-center justify-center relative">
                                            {getNotificationIcon(n.type)}
                                            {!n.is_read && (
                                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-primary rounded-full border-2 border-card" />
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between mb-1">
                                            <h4 className="font-bold text-sm text-foreground truncate pr-2">
                                                {n.title || "Update Received"}
                                            </h4>
                                            {!n.is_read && (
                                                <div className="w-2.5 h-2.5 bg-primary rounded-full mt-1 shrink-0" />
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed mb-3">
                                            {n.message}
                                        </p>
                                        <div className="flex items-center gap-3 text-[10px] text-muted-foreground font-medium">
                                            <div className="flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {formatDate(new Date(n.createdAt))}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => handleDelete(e, n._id)}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 hover:bg-destructive/10 hover:text-destructive rounded-lg transition-all self-start"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ))
                        )}

                        {hasNextPage && (
                            <Button
                                variant="outline"
                                className="w-full text-xs h-10 border-dashed"
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                            >
                                {isFetchingNextPage ? "Loading..." : "View previous notifications"}
                            </Button>
                        )}
                    </div>
                </ScrollArea>

                <div className="p-4 bg-muted/20 text-center">
                    <p className="text-xs font-semibold text-muted-foreground">
                        {unreadCount} notifications require your attention
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}
