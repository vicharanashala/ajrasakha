import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Input } from "@/components/atoms/input";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Textarea } from "@/components/atoms/textarea";
import type { UserDetail } from "../hooks/useUserDetails";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import { BellIcon, Loader2 } from "lucide-react";
import type { AssignableUser } from "./CoordinatorDashboardSections";

type UserNotification = {
  _id: string;
  enitity_id: string;
  message: string;
  title: string;
  is_read: boolean;
  type: string;
  createdAt: string;
  deliveryTimestamp?: string;
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
  direction?: "sent" | "received";
};

export function CoordinatorNotificationDialog({
  users,
  open,
  isSending,
  defaultTitle,
  onOpenChange,
  onSend,
}: {
  users: AssignableUser[];
  open: boolean;
  isSending: boolean;
  defaultTitle: string;
  onOpenChange: (open: boolean) => void;
  onSend: (payload: { title: string; message: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");
  const recipientKey = users.map((user) => user._id).join(",");

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setMessage("");
    }
  }, [defaultTitle, open, recipientKey]);

  const canSend = message.trim().length > 0 && !isSending;
  const recipientText =
    users.length === 1
      ? `Send a notification to ${users[0]?.name}.`
      : `Send a notification to ${users.length} selected users.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message</DialogTitle>
          <DialogDescription>{recipientText}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="notification-title">
              Title
            </label>
            <Input
              id="notification-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isSending}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="notification-message">
              Message
            </label>
            <Textarea
              id="notification-message"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={isSending}
              className="min-h-28"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canSend}
            onClick={() =>
              void onSend({
                title,
                message,
              })
            }
          >
            {isSending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              "Send"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserNotificationHistorySheet({
  user,
  open,
  onOpenChange,
}: {
  user: UserDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const targetUserId = user?.userId ? String(user.userId) : "";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["user-notification-history", targetUserId],
    enabled: open && Boolean(targetUserId),
    queryFn: async () =>
      apiFetch<{
        notifications: UserNotification[];
        page: number;
        totalCount: number;
        totalPages: number;
      }>(
        `${env.apiBaseUrl()}/notifications/user/${targetUserId}?page=1&limit=50`,
      ),
  });
  const notifications = data?.notifications ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b p-6 pr-12">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2">
              <BellIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold">
                Activity Logs
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {user?.name || user?.email || "Selected user"}
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 bg-muted/10">
          <div className="space-y-4 p-6">
            {isLoading && (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading activity logs...
              </div>
            )}

            {isError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Failed to load activity logs.
              </div>
            )}

            {!isLoading && !isError && notifications.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-4 rounded-full bg-muted p-4">
                  <BellIcon className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="text-base font-semibold">No activity logs</h3>
                <p className="text-sm text-muted-foreground">
                  No activity logs found for this user.
                </p>
              </div>
            )}

            {notifications.map((notification) => (
              <div
                key={notification._id}
                className="rounded-xl border bg-card p-4 shadow-sm"
              >
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold">
                      {getNotificationDisplayTitle(notification)}
                    </h4>
                  </div>
                  <Badge variant={notification.is_read ? "outline" : "default"}>
                    {notification.is_read ? "Read" : "Unread"}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {notification.message}
                </p>
                <div className="mt-4 grid gap-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  <div className="flex justify-between gap-3">
                    <span>Sender</span>
                    <span className="text-right font-medium text-foreground">
                      {notification.sender?.name || notification.sender?.email || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Sender Role</span>
                    <span className="text-right font-medium text-foreground">
                      {notification.sender?.role || "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Recipient</span>
                    <span className="text-right font-medium text-foreground">
                      {notification.recipient?.name ||
                        notification.recipient?.email ||
                        user?.name ||
                        user?.email ||
                        "N/A"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Delivered</span>
                    <span className="text-right font-medium text-foreground">
                      {formatDate(
                        notification.deliveryTimestamp || notification.createdAt,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function getNotificationDisplayTitle(notification: UserNotification) {
  if (notification.direction === "sent") {
    const recipient =
      notification.recipient?.name || notification.recipient?.email;

    return recipient ? `Message sent to ${recipient}` : "Message sent";
  }

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

  return notification.title || "Notification";
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}
