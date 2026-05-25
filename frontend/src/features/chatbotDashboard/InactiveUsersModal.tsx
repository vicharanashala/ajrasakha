import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

import { ScrollArea } from "@/components/atoms/scroll-area";
import { Pagination } from "@/components/pagination";
import WhatsappHistoryLink from "./components/WhatsappHistoryLink";
import { Clock, Inbox, MessageCircleOff, PartyPopper } from "lucide-react";

type InactiveUser = {
  phoneNumber: string;
  messageCount: number;
  firstMessageAt: string;
  lastMessageAt: string;
  lastMessageText: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: InactiveUser[];

  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };

  onPageChange: (page: number) => void;
};

export function InactiveUsersModal({
  open,
  onOpenChange,
  users,
  pagination,
  onPageChange,
}: Props) {
  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };


  // console.log("-------users------",users)
  const getInactiveDays = (date: string) => {
    const diff = Date.now() - new Date(date).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-6xl w-[72vw] border-border bg-background p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border bg-gradient-to-b from-muted/40 to-transparent">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                <MessageCircleOff className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  Inactive WhatsApp Users
                </DialogTitle>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Users inactive for more than 3 days
                </p>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-xs font-medium text-muted-foreground">
                {pagination?.total ?? users.length} inactive
              </span>
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <ScrollArea className="h-[520px] px-6 py-4">
          {users.length === 0 ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                <Inbox className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">No inactive users</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex items-center justify-center rounded-full bg-primary/10 p-1">
                  <PartyPopper className="h-3.5 w-3.5 text-primary" />
                </span>
                Everyone&apos;s been active recently
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {users.map((user) => (
                <div
                  key={user.phoneNumber}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-md hover:shadow-primary/5"
                >
                  {/* subtle hover accent */}
                  <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                  {/* Top row */}
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-base font-semibold">
                        <WhatsappHistoryLink mobileNumber={user.phoneNumber} />
                      </div>
                      <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>
                          Inactive for{" "}
                          <span className="font-semibold text-foreground">
                            {getInactiveDays(user.lastMessageAt)}
                          </span>{" "}
                          days
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-right">
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Messages
                      </span>
                      <span className="text-xl font-bold leading-none text-primary">
                        {user.messageCount}
                      </span>
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        First Message
                      </div>
                      <div className="mt-0.5 text-sm font-medium">
                        {formatDate(user.firstMessageAt)}
                      </div>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5">
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Last Message
                      </div>
                      <div className="mt-0.5 text-sm font-medium">
                        {formatDate(user.lastMessageAt)}
                      </div>
                    </div>
                  </div>

                  {/* Last message */}
                  <div className="mt-3 rounded-lg border-l-2 border-primary/40 bg-muted/20 p-3">
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                      Last Message
                    </div>
                    <p className="line-clamp-3 text-sm leading-relaxed text-foreground/90">
                      {user.lastMessageText}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t border-border bg-muted/20 px-6 py-3">
          <Pagination
            currentPage={pagination?.page ?? 1}
            totalPages={pagination?.totalPages ?? 1}
            onPageChange={onPageChange}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
