import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

import { ScrollArea } from "@/components/atoms/scroll-area";
import { Pagination } from "@/components/pagination";

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
      <DialogContent
        className="
            !max-w-7xl
            border-border
            bg-background
            w-[70vw]
            "
      >
        <DialogHeader>
          <DialogTitle
            className="
                text-2xl
                font-semibold
                "
          >
            Inactive WhatsApp Users
          </DialogTitle>

          <p
            className="
                text-sm
                text-muted-foreground
                "
          >
            Users inactive for more than 3 days
          </p>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-3">
          <div className="space-y-4">
            {users.map((user) => (
              <div
                key={user.phoneNumber}
                className="
                    rounded-2xl
                    border
                    border-border
                    bg-card
                    p-3
                    transition-all
                    hover:border-primary/40
                    "
              >
                <div
                  className="
                        mb-4
                        flex
                        items-start
                        justify-between
                        gap-1
                    "
                >
                  <div>
                    <div
                      className="
                            text-lg
                            font-semibold
                        "
                    >
                      <a
                        href={`https://desk.vicharanashala.ai/whatsapp-history?threadId=${user.phoneNumber}&date=${user.lastMessageAt.split("T")[0]}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="
                            text-primary
                            underline-offset-4
                            hover:underline
                            cursor-pointer
                        "
                      >
                        {user.phoneNumber}
                      </a>
                    </div>

                    <div
                      className="
                            mt-1
                            text-sm
                            text-muted-foreground
                        "
                    >
                      Inactive for{" "}
                      <span className="font-medium">
                        {getInactiveDays(user.lastMessageAt)} days
                      </span>
                    </div>
                  </div>

                  <div
                    className="
                        rounded-xl
                        border
                        border-primary/30
                        bg-primary/10
                        px-2
                        py-1
                        text-right
                        "
                  >
                    <div
                      className="
                            text-xs
                            text-muted-foreground
                        "
                    >
                      Messages
                    </div>

                    <div
                      className="
                            text-2xl
                            font-bold
                            text-primary
                        "
                    >
                      {user.messageCount}
                    </div>
                  </div>
                </div>

                <div
                  className="
                        grid
                        grid-cols-1
                        gap-2
                        md:grid-cols-2
                    "
                >
                  <div
                    className="
                        rounded-xl
                        border
                        bg-muted/30
                        p-3
                        "
                  >
                    <div
                      className="
                            mb-1
                            text-xs
                            text-muted-foreground
                        "
                    >
                      First Message
                    </div>

                    <div className="font-medium">
                      {formatDate(user.firstMessageAt)}
                    </div>
                  </div>

                  <div
                    className="
                        rounded-xl
                        border
                        bg-muted/30
                        p-3
                        "
                  >
                    <div
                      className="
                            mb-1
                            text-xs
                            text-muted-foreground
                        "
                    >
                      Last Message
                    </div>

                    <div className="font-medium">
                      {formatDate(user.lastMessageAt)}
                    </div>
                  </div>
                </div>

                <div
                  className="
                        mt-4
                        rounded-xl
                        border
                        bg-muted/20
                        p-4
                    "
                >
                  <div
                    className="
                        mb-2
                        text-xs
                        text-muted-foreground
                        "
                  >
                    Last Message Text
                  </div>

                  <div
                    className="
                        text-sm
                        leading-relaxed
                        "
                  >
                    {user.lastMessageText}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
        <div
          className="
    mt-4
    border-t
    pt-4
  "
        >
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
