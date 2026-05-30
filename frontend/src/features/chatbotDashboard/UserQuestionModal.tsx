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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/atoms/accordion";
import { Activity, ChevronLeft, ChevronRight, CircleHelp, Clock, HelpCircle, History, Inbox, Mail, MessageSquare, MessageSquareText, User } from "lucide-react";
import { Switch } from "@/components/atoms/switch";
import { Label } from "@/components/atoms/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";
import { TranslatableText } from "./components/TranslatableText";

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

  return (
    <div className="group border rounded-xl px-4 py-3.5 bg-background hover:border-border/80 hover:bg-muted/20 transition-all duration-150">
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
}: UserActivityDialogProps) {
  const totalPages = activeData?.totalPages ?? 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-6xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0 [&>button]:hidden rounded-2xl">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b shrink-0">
          <DialogHeader className="p-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Activity className="h-4.5 w-4.5 text-primary" />
              User Activity
            </DialogTitle>
          </DialogHeader>

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
  );
}



export default UserQuestionsModal;









  //  <Dialog open={open} onOpenChange={onOpenChange}>
  //    <DialogContent className="!max-w-6xl w-[85vw] max-h-[95vh] overflow-hidden flex flex-col [&>button]:hidden">
  //      <div className="flex items-center justify-between border-b pb-4">
  //        <DialogHeader className="p-0">
  //          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
  //            <Activity className="h-5 w-5 text-primary" />
  //            <span>User Activity</span>
  //          </DialogTitle>
  //        </DialogHeader>

  //        <div className="flex items-center gap-3 rounded-full border px-4 py-2 shadow-sm bg-muted/30">
  //          <span
  //            className={`text-sm font-medium transition-colors ${
  //              viewType === "messages"
  //                ? "text-primary"
  //                : "text-muted-foreground"
  //            }`}
  //          >
  //            All Messages
  //          </span>

  //          <Switch
  //            id="questions-only"
  //            checked={viewType === "questions"}
  //            onCheckedChange={(checked) => {
  //              setCurrentPage(1);
  //              setViewType(checked ? "questions" : "messages");
  //            }}
  //            className="data-[state=checked]:bg-primary"
  //          />

  //          <span
  //            className={`text-sm font-medium transition-colors ${
  //              viewType === "questions"
  //                ? "text-primary"
  //                : "text-muted-foreground"
  //            }`}
  //          >
  //            Questions Only
  //          </span>
  //        </div>
  //      </div>

  //      {user && (
  //        <Accordion type="single" collapsible className="border-b pb-2">
  //          <AccordionItem value="user-details" className="border-none">
  //            <AccordionTrigger className="py-2 text-sm font-semibold hover:no-underline">
  //              <div className="flex items-center gap-2">
  //                <User className="h-4 w-4 text-primary" />
  //                <span>User Details</span>
  //              </div>
  //            </AccordionTrigger>

  //            <AccordionContent>
  //              <div className="space-y-3 pt-2 text-sm">
  //                <div>
  //                  <span className="font-semibold">Name:</span> {user.name}
  //                </div>

  //                <div>
  //                  <span className="font-semibold">Email:</span> {user.email}
  //                </div>

  //                <div>
  //                  <span className="font-semibold">
  //                    {viewType === "questions"
  //                      ? "Total Questions:"
  //                      : "Total Messages:"}
  //                  </span>{" "}
  //                  {totalCount}
  //                </div>
  //              </div>
  //            </AccordionContent>
  //          </AccordionItem>
  //        </Accordion>
  //      )}

  //      <div className="flex-1 overflow-y-auto mt-4 space-y-4">
  //        {isLoading ? (
  //          <div className="text-center py-10">Loading {viewType}...</div>
  //        ) : items.length === 0 ? (
  //          <div className="text-center py-10 text-muted-foreground">
  //            No {viewType} found.
  //          </div>
  //        ) : (
  //          items.map((item: any, idx: number) => (
  //            <div key={idx} className="border rounded-lg px-4 py-3">
  //              {/* Top Section */}

  //              <div className="flex items-start justify-between gap-4">
  //                {/* Left Side */}

  //                <div className="flex-1 min-w-0">
  //                  <div className="font-medium break-words line-clamp-2">
  //                    {viewType === "questions" ? item.question : item.message}
  //                  </div>

  //                  <div className="text-sm text-muted-foreground mt-2">
  //                    Created:{" "}
  //                    {item.createdAt
  //                      ? new Date(item.createdAt).toLocaleString()
  //                      : "—"}
  //                  </div>
  //                </div>

  //                {/* Right Side */}

  //                <div className="flex items-center gap-2 shrink-0">
  //                  {/* Status */}

  //                  {viewType === "questions" && (
  //                    <Badge
  //                      variant={
  //                        item.status === "duplicate"
  //                          ? "destructive"
  //                          : item.status === "closed"
  //                            ? "default"
  //                            : "secondary"
  //                      }
  //                    >
  //                      {item.status}
  //                    </Badge>
  //                  )}

  //                  {/* Timeline Button */}

  //                  {item.isDuplicate && item.repeatedCount - 1 > 0 && (
  //                    <Button
  //                      variant="outline"
  //                      size="sm"
  //                      onClick={() => {
  //                        setSelectedTimeline(item.repeatedAt || []);

  //                        setTimelineModalOpen(true);
  //                      }}
  //                    >
  //                      {item.repeatedCount - 1 > 0
  //                        ? `${item.repeatedCount - 1}X`
  //                        : null}
  //                    </Button>
  //                  )}
  //                </div>
  //              </div>

  //              {/* Dates */}

  //              {/* <div className="text-sm text-muted-foreground flex flex-wrap gap-4">
  //                 <div>
  //                   Created:{" "}
  //                   {item.createdAt
  //                     ? new Date(item.createdAt).toLocaleString()
  //                     : "—"}
  //                 </div> */}

  //              {/* <div>
  //                   Updated:{" "}
  //                   {item.updatedAt
  //                     ? new Date(
  //                         item.updatedAt,
  //                       ).toLocaleString()
  //                     : "—"}
  //                 </div> */}
  //            </div>
  //          ))
  //        )}
  //      </div>

  //      {activeData?.totalPages > 1 && (
  //        <div className="flex items-center justify-between pt-4 border-t">
  //          <Button
  //            variant="outline"
  //            disabled={currentPage === 1}
  //            onClick={() => setCurrentPage((p) => p - 1)}
  //          >
  //            Previous
  //          </Button>

  //          <div className="text-sm text-muted-foreground">
  //            Page {currentPage} of {activeData?.totalPages}
  //          </div>

  //          <Button
  //            variant="outline"
  //            disabled={currentPage === activeData?.totalPages}
  //            onClick={() => setCurrentPage((p) => p + 1)}
  //          >
  //            Next
  //          </Button>
  //        </div>
  //      )}
  //    </DialogContent>
  //  </Dialog>;