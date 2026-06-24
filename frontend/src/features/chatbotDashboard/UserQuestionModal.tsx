import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

import { Badge } from "@/components/atoms/badge";

import { Button } from "@/components/atoms/button";

import { useUserQuestionsData } from "./hooks/useUserQuestionData";

import { useEffect, useMemo, useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/atoms/accordion";
import {
  Activity,
  Bell,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  HelpCircle,
  History,
  Inbox,
  Mail,
  MessageSquare,
  MessageSquareText,
  Phone,
  RefreshCw,
  User,
} from "lucide-react";
import { Switch } from "@/components/atoms/switch";
import { Label } from "@/components/atoms/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

import { Textarea } from "@/components/atoms/textarea";
import { TranslatableText } from "./components/TranslatableText";
import { useNotifyUser } from "./hooks/useNotifyUser";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

interface UserQuestionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: any;
  source: string;
  userType: string;
}

const UserQuestionsModal = ({
  open,
  onOpenChange,
  user,
  source,
  userType,
}: UserQuestionsModalProps) => {
  const [currentPage, setCurrentPage] = useState(1);

  const [viewType, setViewType] = useState<"messages" | "questions">(
    "messages",
  );

  const [timelineModalOpen, setTimelineModalOpen] = useState(false);

  const [selectedTimeline, setSelectedTimeline] = useState<string[]>([]);

  const [notifyModalOpen, setNotifyModalOpen] = useState(false);

  const [customMessage, setCustomMessage] = useState(
    "Hello! We noticed you are recently not active. Any problems you are facing?",
  );

  // Reset page when modal closes or user changes
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
  // console.log("UserQuestionModal data", fullData);
  const latestMessageId = fullData?.messages?.items?.[0]?.messageId;
  const activeData = useMemo(() => {
    return viewType === "questions" ? fullData?.questions : fullData?.messages;
  }, [viewType, fullData]);

  const items = useMemo(() => {
    return activeData?.items || [];
  }, [activeData]);

  const totalCount =
    viewType === "questions"
      ? (fullData?.questions?.total ?? 0)
      : (user?.totalQuestions?.toLocaleString() ?? 0);

  // const lastActiveTime = new Date(fullData?.messages.items[0].createdAt).toLocaleString();

  return (
    <>
      <RepeatTimelineDialog
        open={timelineModalOpen}
        onOpenChange={setTimelineModalOpen}
        selectedTimeline={selectedTimeline}
      />

      <UserActivityDialog
        open={open}
        onOpenChange={onOpenChange}
        user={user}
        items={items}
        isLoading={isLoading}
        totalCount={totalCount}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        viewType={viewType}
        setViewType={setViewType}
        activeData={activeData}
        setSelectedTimeline={setSelectedTimeline}
        setTimelineModalOpen={setTimelineModalOpen}
        // lastActive={lastActiveTime}
        notifyModalOpen={notifyModalOpen}
        setNotifyModalOpen={setNotifyModalOpen}
        customMessage={customMessage}
        setCustomMessage={setCustomMessage}
        latestMessageId={latestMessageId}
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
      <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden gap-0">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4 text-primary" />
            Repeat Timeline
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {sorted.length} occurrence{sorted.length !== 1 ? "s" : ""}, most
            recent first
          </p>
        </DialogHeader>

        {/* Timeline */}
        <div className="overflow-y-auto max-h-[55vh] px-5 py-4">
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No occurrences recorded.
            </p>
          ) : (
            <ol className="relative border-l border-border/60 ml-2 space-y-0">
              {sorted.map((date, idx) => (
                <li key={idx} className="pl-5 pb-4 last:pb-0 relative">
                  {/* dot */}
                  <span
                    className={`absolute -left-[5px] top-[5px] h-2.5 w-2.5 rounded-full border-2 border-background ${
                      idx === 0 ? "bg-primary" : "bg-muted-foreground/40"
                    }`}
                  />

                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
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
                      <span className="ml-1 text-[10px] font-medium bg-primary/10 text-primary rounded-full px-2 py-0.5">
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

interface ActivityItem {
  _id?: string;
  question?: string;
  message?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: "open" | "closed" | "duplicate" | string;
  isDuplicate?: boolean;
  repeatedCount?: number;
  repeatedAt?: string[];
}

interface ActiveData {
  totalPages: number;
}

interface UserInfo {
  name: string;
  email: string;
  phoneNo: string;
}

interface UserActivityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: UserInfo;
  items: ActivityItem[];
  isLoading?: boolean;
  totalCount?: number;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  viewType: "messages" | "questions";
  setViewType: React.Dispatch<React.SetStateAction<"messages" | "questions">>;
  activeData?: ActiveData;
  setSelectedTimeline: (dates: string[]) => void;
  setTimelineModalOpen: (open: boolean) => void;
  // lastActive: string;
  notifyModalOpen: boolean;
  setNotifyModalOpen: React.Dispatch<React.SetStateAction<boolean>>;

  customMessage: string;
  setCustomMessage: React.Dispatch<React.SetStateAction<string>>;

  latestMessageId?: string | null;
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<
    string,
    { variant: "destructive" | "secondary" | "outline"; label: string }
  > = {
    duplicate: { variant: "destructive", label: "Duplicate" },
    closed: { variant: "secondary", label: "Closed" },
  };
  const cfg = map[status] ?? { variant: "outline", label: status };
  return (
    <Badge
      variant={cfg.variant}
      className="rounded-full text-[11px] font-medium tracking-wide px-2.5 capitalize"
    >
      {cfg.label}
    </Badge>
  );
}

function EmptyState({ viewType }: { viewType: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
      <Inbox className="h-10 w-10 opacity-30" />
      <p className="text-sm">No {viewType} found.</p>
    </div>
  );
}

function LoadingState({ viewType }: { viewType: string }) {
  return (
    <div className="space-y-3 py-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="border rounded-xl px-4 py-4 animate-pulse"
          style={{ opacity: 1 - i * 0.2 }}
        >
          <div className="h-4 bg-muted rounded w-3/4 mb-3" />
          <div className="h-3 bg-muted rounded w-1/3" />
        </div>
      ))}
    </div>
  );
}

function ActivityCard({
  item,
  viewType,
  onTimelineClick,
}: {
  item: ActivityItem;
  viewType: "messages" | "questions";
  onTimelineClick: () => void;
}) {
  const text = viewType === "questions" ? item.question : item.message;
  const repeatCount = (item.repeatedCount ?? 0) - 1;
  const navigate = useNavigate();

  const handleCardClick = () => {
    if (viewType === "questions" && item._id) {
      navigate({
        to: "/home",
        search: (prev: any) => ({ ...prev, question: item._id }),
      });
    }
  };

  return (
    <div 
      className={`group border rounded-xl px-4 py-3.5 bg-background hover:border-border/80 hover:bg-muted/20 transition-all duration-150 ${viewType === "questions" && item._id ? "cursor-pointer" : ""}`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* <p className="font-medium text-[14.5px] leading-snug line-clamp-2 break-words text-foreground">
            {text}
          </p> */}
          <TranslatableText
            text={text!}
            showTooltip
            textClassName="text-xs line-clamp-2"
          />
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            {item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}
          </p>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          {viewType === "questions" && item.status && (
            <StatusBadge status={item.status} />
          )}

          {item.isDuplicate && repeatCount > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1.5 rounded-lg"
                    onClick={onTimelineClick}
                  >
                    <History className="h-3 w-3" aria-hidden />
                    {repeatCount}×
                  </Button>
                </TooltipTrigger>

                <TooltipContent>
                  <p>Click here to view more timelines</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>


        
      </div>
    </div>
  );
}

function UserActivityDialog({
  open,
  onOpenChange,
  user,
  items,
  isLoading = false,
  totalCount = 0,
  currentPage,
  setCurrentPage,
  viewType,
  setViewType,
  activeData,
  setSelectedTimeline,
  setTimelineModalOpen,
  // lastActive,

  notifyModalOpen,
  setNotifyModalOpen,
  customMessage,
  setCustomMessage,
  latestMessageId,
}: UserActivityDialogProps) {
  const totalPages = activeData?.totalPages ?? 1;
console.log(user, "UserActivityDialog render");
  const { mutate: notifyUser, isPending } = useNotifyUser();
  const queryClient = useQueryClient();
  const handleRefresh = async ()=>{
    await queryClient.refetchQueries({ queryKey: ["user-questions-data"] });
  }

  return (
    <>
      <Dialog open={notifyModalOpen} onOpenChange={setNotifyModalOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
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
                onClick={() => {
                  notifyUser({
                    userEmail: user.email,
                    messageId: latestMessageId ?? null,
                    message: customMessage,
                  });

                  setNotifyModalOpen(false);
                  setCustomMessage(
                    "Hello! We noticed you are recently not active. Any problems you are facing?",
                  );
                }}
              >
                {isPending ? "Sending..." : "Send Notification"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="!max-w-6xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 [&>button]:hidden rounded-2xl">
          {/* ── Header ── */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b shrink-0">
            <div className="flex justify-start items-center gap-3">
              <DialogHeader className="p-0">
                <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                  <Activity className="h-4.5 w-4.5 text-primary" />
                  User Activity
                </DialogTitle>
              </DialogHeader>

              {/* Action Buttons */}
              <TooltipProvider>
                <div className="flex items-center gap-2">
                  {/* Call */}
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

                  {/* Mail */}
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

                  {/* Notify */}
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

                  {/* <Tooltip>
                    <TooltipTrigger asChild>
                      
                <Button
                        onClick={handleRefresh}
                        className="absolute top-4 right-4 z-20 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5${isLoading ? "animate-spin" : ""}`}
                        />
                      </Button>
                      <TooltipContent>
                        <p>Refresh</p>
                      </TooltipContent>
                    </TooltipTrigger>
                  </Tooltip> */}
                </div>
              </TooltipProvider>
            </div>

            {/* Toggle */}
            <div className="flex items-center gap-2.5 bg-muted/40 border rounded-full px-3.5 py-1.5">
              <MessageSquare
                className={`h-3.5 w-3.5 transition-colors ${
                  viewType === "messages"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
              <span
                className={`text-xs font-medium transition-colors ${
                  viewType === "messages"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                Messages
              </span>
              <Switch
                checked={viewType === "questions"}
                onCheckedChange={(checked) => {
                  setCurrentPage(1);
                  setViewType(checked ? "questions" : "messages");
                }}
                className="data-[state=checked]:bg-primary scale-90"
              />
              <span
                className={`text-xs font-medium transition-colors ${
                  viewType === "questions"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                Questions
              </span>
              <HelpCircle
                className={`h-3.5 w-3.5 transition-colors ${
                  viewType === "questions"
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
            </div>
            <div>
              <button
                onClick={handleRefresh}
                className="absolute top-4 right-4 z-20 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
                title="Refresh"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5${isLoading ? "animate-spin" : ""}`}
                />
              </button>
            </div>
          </div>

          {/* ── User Details ── */}
          {user && (
            <div className="px-6 border-b shrink-0">
              <Accordion type="single" collapsible>
                <AccordionItem value="user-details" className="border-none">
                  <AccordionTrigger className="py-3 hover:no-underline">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <User className="h-3.5 w-3.5 text-primary" />
                      User Details
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pb-3">
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        {
                          label: "Name",
                          value: user.name,
                          icon: User,
                        },
                        {
                          label: "Email",
                          value: user.email,
                          icon: Mail,
                        },
                        {
                          label:
                            viewType === "questions"
                              ? "Total Questions"
                              : "Total Messages",
                          value: totalCount,
                          icon:
                            viewType === "questions"
                              ? CircleHelp
                              : MessageSquareText,
                        },
                      ].map(({ label, value, icon: Icon }) => (
                        <div
                          key={label}
                          className="bg-muted/40 rounded-lg px-3 py-3 border"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 rounded-md bg-primary/10 p-2">
                              <Icon className="h-4 w-4 text-primary" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] text-muted-foreground mb-0.5 uppercase tracking-wide font-medium">
                                {label}
                              </p>

                              <p className="text-sm font-medium text-foreground truncate">
                                {value}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          )}

          {/* ── Content ── */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
            {isLoading ? (
              <LoadingState viewType={viewType} />
            ) : items.length === 0 ? (
              <EmptyState viewType={viewType} />
            ) : (
              items.map((item, idx) => (
                <ActivityCard
                  key={idx}
                  item={item}
                  viewType={viewType}
                  onTimelineClick={() => {
                    setSelectedTimeline(item.repeatedAt ?? []);
                    setTimelineModalOpen(true);
                  }}
                />
              ))
            )}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3.5 border-t shrink-0 bg-muted/10">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-lg"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => p - 1)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </Button>

              <span className="text-xs text-muted-foreground font-medium">
                Page {currentPage} of {totalPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 rounded-lg"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UserQuestionsModal;
