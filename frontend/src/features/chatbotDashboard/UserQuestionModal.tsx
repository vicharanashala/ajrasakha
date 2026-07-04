import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Clock, History, Mail, Phone, RefreshCw } from "lucide-react";

import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

import {
  QuestionActivityModal,
  type QuestionActivityItem,
  type QuestionActivityViewType,
} from "./components/QuestionActivityModal";
import { useNotifyUser } from "./hooks/useNotifyUser";
import { useUserQuestionsData } from "./hooks/useUserQuestionData";

interface UserQuestionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  source: string;
  userType: string;
}

const DEFAULT_NOTIFICATION_MESSAGE =
  "Hello! We noticed you are recently not active. Any problems you are facing?";

const UserQuestionsModal = ({
  open,
  onOpenChange,
  user,
  source,
  userType,
}: UserQuestionsModalProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [viewType, setViewType] =
    useState<QuestionActivityViewType>("messages");
  const [timelineModalOpen, setTimelineModalOpen] = useState(false);
  const [selectedTimeline, setSelectedTimeline] = useState<string[]>([]);
  const [notifyModalOpen, setNotifyModalOpen] = useState(false);
  const [customMessage, setCustomMessage] = useState(
    DEFAULT_NOTIFICATION_MESSAGE,
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [user?.email, viewType]);

  const { data: fullData, isLoading } = useUserQuestionsData(
    user?.email || "",
    source as any,
    userType as any,
    currentPage,
    10,
  );
  const queryClient = useQueryClient();
  const { mutate: notifyUser, isPending } = useNotifyUser();

  const latestMessageId = fullData?.messages?.items?.[0]?.messageId;
  const activeData = useMemo(
    () => (viewType === "questions" ? fullData?.questions : fullData?.messages),
    [fullData, viewType],
  );
  const items = useMemo(
    () => (activeData?.items || []) as QuestionActivityItem[],
    [activeData],
  );
  const totalCount =
    viewType === "questions"
      ? (fullData?.questions?.total ?? 0)
      : (user?.totalQuestions?.toLocaleString() ?? 0);

  const handleRefresh = async () => {
    await queryClient.refetchQueries({ queryKey: ["user-questions-data"] });
  };

  const handleNotify = () => {
    notifyUser({
      userEmail: user.email,
      messageId: latestMessageId ?? null,
      message: customMessage,
    });

    setNotifyModalOpen(false);
    setCustomMessage(DEFAULT_NOTIFICATION_MESSAGE);
  };

  return (
    <>
      <RepeatTimelineDialog
        open={timelineModalOpen}
        onOpenChange={setTimelineModalOpen}
        selectedTimeline={selectedTimeline}
      />

      <Dialog open={notifyModalOpen} onOpenChange={setNotifyModalOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-primary" />
              Send Notification
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Custom Message</Label>
              <Textarea
                placeholder="Write your custom notification message..."
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="min-h-[120px] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setNotifyModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                disabled={!customMessage?.trim() || isPending}
                onClick={handleNotify}
              >
                {isPending ? "Sending..." : "Send Notification"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <QuestionActivityModal
        open={open}
        onOpenChange={onOpenChange}
        title="User Activity"
        user={user}
        mode="activity"
        viewType={viewType}
        onViewTypeChange={(nextViewType) => {
          setCurrentPage(1);
          setViewType(nextViewType);
        }}
        activityItems={items}
        isLoading={isLoading}
        totalCount={totalCount}
        totalPages={activeData?.totalPages ?? 1}
        currentPage={currentPage}
        onPageChange={setCurrentPage}
        onTimelineClick={(dates) => {
          setSelectedTimeline(dates);
          setTimelineModalOpen(true);
        }}
        headerActions={
          <TooltipProvider>
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-full"
                    onClick={() =>
                      (window.location.href = `tel:+91${user?.farmerProfile?.phoneNo}`)
                    }
                  >
                    <Phone className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Call User</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-full"
                    onClick={() =>
                      (window.location.href = `mailto:${user?.email}`)
                    }
                  >
                    <Mail className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Send Email</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-full"
                    onClick={() => setNotifyModalOpen(true)}
                  >
                    <Bell className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Send Notification</p>
                </TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8 rounded-full"
                    onClick={handleRefresh}
                    title="Refresh"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5${isLoading ? " animate-spin" : ""}`}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Refresh</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        }
      />
    </>
  );
};

interface RepeatTimelineDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTimeline: string[];
}

function RepeatTimelineDialog({
  open,
  onOpenChange,
  selectedTimeline,
}: RepeatTimelineDialogProps) {
  const sorted = [...(selectedTimeline ?? [])].sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 overflow-hidden rounded-2xl p-0">
        <DialogHeader className="border-b px-5 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4 text-primary" />
            Repeat Timeline
          </DialogTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sorted.length} occurrence{sorted.length !== 1 ? "s" : ""}, most
            recent first
          </p>
        </DialogHeader>

        <div className="max-h-[55vh] overflow-y-auto px-5 py-4">
          {sorted.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No occurrences recorded.
            </p>
          ) : (
            <ol className="relative ml-2 space-y-0 border-l border-border/60">
              {sorted.map((date, idx) => (
                <li key={idx} className="relative pb-4 pl-5 last:pb-0">
                  <span
                    className={`absolute -left-[5px] top-[5px] h-2.5 w-2.5 rounded-full border-2 border-background ${
                      idx === 0 ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                  />

                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                    <span
                      className={`text-sm ${
                        idx === 0
                          ? "font-medium text-foreground"
                          : "text-muted-foreground"
                      }`}
                    >
                      {new Date(date).toLocaleString()}
                    </span>
                    {idx === 0 && (
                      <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        Latest
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default UserQuestionsModal;
