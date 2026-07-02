import { type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Activity,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock,
  HelpCircle,
  History,
  Inbox,
  Mail,
  MapPin,
  MessageSquare,
  MessageSquareText,
  User,
} from "lucide-react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/atoms/accordion";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Switch } from "@/components/atoms/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

import { TranslatableText } from "./TranslatableText";

export type QuestionActivityViewType = "messages" | "questions";

export interface QuestionActivityItem {
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

export interface QuestionDetailItem {
  questionId: string;
  question?: string;
  status?: string;
  askedBy?: string;
  email?: string;
  userId?: string;
  state?: string;
  district?: string;
  block?: string;
  village?: string;
  crop?: string;
  domain?: string;
  createdAt?: string;
  referenceQuestionId?: string;
  referenceQuestion?: string;
}

export interface QuestionDuplicateGroup {
  key: string;
  referenceQuestion: string;
  questions: QuestionDetailItem[];
}

interface QuestionActivityUser {
  name?: string;
  email?: string;
}

interface QuestionActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  user?: QuestionActivityUser | null;
  headerActions?: ReactNode;
  mode?: "activity" | "details" | "duplicateGroups";
  viewType?: QuestionActivityViewType;
  onViewTypeChange?: (viewType: QuestionActivityViewType) => void;
  activityItems?: QuestionActivityItem[];
  detailItems?: QuestionDetailItem[];
  duplicateGroups?: QuestionDuplicateGroup[];
  isLoading?: boolean;
  totalCount?: number | string;
  totalPages?: number;
  currentPage?: number;
  onPageChange?: (page: number) => void;
  onTimelineClick?: (dates: string[]) => void;
  emptyMessage?: ReactNode;
  duplicateEmptyMessage?: ReactNode;
}

const formatDateTime = (value?: string) => {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
};

function StatusBadge({ status }: { status: string }) {
  const normalizedStatus = status.trim().toLowerCase().replace(/_/g, "-");
  const map: Record<
    string,
    { variant: "destructive" | "secondary" | "outline"; label: string }
  > = {
    duplicate: { variant: "destructive", label: "Duplicate" },
    closed: { variant: "secondary", label: "Closed" },
  };
  const cfg = map[normalizedStatus] ?? { variant: "outline", label: status };

  return (
    <Badge
      variant={cfg.variant}
      className="rounded-full px-2.5 text-[11px] font-medium tracking-wide capitalize"
    >
      {cfg.label}
    </Badge>
  );
}

function EmptyState({ message }: { message: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
      <Inbox className="h-10 w-10 opacity-30" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-3 py-2">
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse rounded-xl border px-4 py-4"
          style={{ opacity: 1 - i * 0.2 }}
        >
          <div className="mb-3 h-4 w-3/4 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted" />
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
  item: QuestionActivityItem;
  viewType: QuestionActivityViewType;
  onTimelineClick?: (dates: string[]) => void;
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
      className={`group rounded-xl border bg-background px-4 py-3.5 transition-all duration-150 hover:border-border/80 hover:bg-muted/20 ${
        viewType === "questions" && item._id ? "cursor-pointer" : ""
      }`}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <TranslatableText
            text={text ?? ""}
            showTooltip
            textClassName={`text-xs line-clamp-2 ${
              viewType === "questions" && item._id
                ? "group-hover:underline cursor-pointer"
                : ""
            }`}
          />
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3 shrink-0" aria-hidden />
            {item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
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
                    className="h-7 gap-1.5 rounded-lg px-2.5 text-xs"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTimelineClick?.(item.repeatedAt ?? []);
                    }}
                  >
                    <History className="h-3 w-3" aria-hidden />
                    {repeatCount}x
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

function QuestionDetailCard({ question }: { question: QuestionDetailItem }) {
  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
          {question.status || "unknown"}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatDateTime(question.createdAt)}
        </span>
      </div>
      <p className="whitespace-pre-wrap text-sm font-medium">
        {question.question || "Question text not available"}
      </p>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <span>
          Asked by:{" "}
          <span className="font-medium text-foreground">
            {question.askedBy || question.email || question.userId || "N/A"}
          </span>
        </span>
        <span>
          Village:{" "}
          <span className="font-medium text-foreground">
            {question.village || "N/A"}
          </span>
        </span>
        <span>
          Block:{" "}
          <span className="font-medium text-foreground">
            {question.block || "N/A"}
          </span>
        </span>
        <span>
          District:{" "}
          <span className="font-medium text-foreground">
            {question.district || "N/A"}
          </span>
        </span>
        <span>
          Crop:{" "}
          <span className="font-medium text-foreground">
            {question.crop || "N/A"}
          </span>
        </span>
        <span>
          Domain:{" "}
          <span className="font-medium text-foreground">
            {question.domain || "N/A"}
          </span>
        </span>
      </div>
    </div>
  );
}

const getLocationPart = (value?: string) => {
  const normalized = value?.trim();
  return normalized && normalized.toLowerCase() !== "all" ? normalized : "";
};

const getQuestionLocationLabel = (question: QuestionDetailItem) => {
  const parts = [
    getLocationPart(question.state),
    getLocationPart(question.district),
    getLocationPart(question.block),
    getLocationPart(question.village),
  ].filter(Boolean);

  return parts.length ? parts.join(" / ") : "Location not available";
};

const getLocationBreakdown = (questions: QuestionDetailItem[]) => {
  const locationMap = new Map<
    string,
    { label: string; count: number; questions: QuestionDetailItem[] }
  >();

  questions.forEach((question) => {
    const label = getQuestionLocationLabel(question);
    const key = label.toLowerCase();
    const current = locationMap.get(key);

    if (current) {
      current.count += 1;
      current.questions.push(question);
      return;
    }

    locationMap.set(key, { label, count: 1, questions: [question] });
  });

  return Array.from(locationMap.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.label.localeCompare(b.label);
  });
};

function DuplicateQuestionRow({ question }: { question: QuestionDetailItem }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2.5">
      <TranslatableText
        text={question.question || "Question text not available"}
        showTooltip
        textClassName="text-xs font-medium leading-5 text-foreground"
      />
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Clock className="h-3 w-3 shrink-0" aria-hidden />
        {formatDateTime(question.createdAt)}
      </p>
    </div>
  );
}

function DuplicateGroupCard({ group }: { group: QuestionDuplicateGroup }) {
  const locationBreakdown = getLocationBreakdown(group.questions);
  const totalDuplicateRecords = group.questions.length;

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
          {totalDuplicateRecords} total duplicate record
          {totalDuplicateRecords === 1 ? "" : "s"}
        </span>
        <span className="text-xs text-muted-foreground">Reference group</span>
      </div>
      <div className="mb-3">
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Reference question
        </p>
        <p className="whitespace-pre-wrap text-sm font-semibold">
          {group.referenceQuestion}
        </p>
      </div>
      <div className="rounded-md bg-muted/40 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Duplicate asker location
        </div>
        <div className="space-y-2">
          {locationBreakdown.map((location) => (
            <div
              key={location.label}
              className="rounded-md border bg-background px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {location.label}
                </span>
                <span className="rounded-full bg-primary/10 px-2.5 py-0.5 font-semibold text-primary">
                  {location.count} duplicate
                  {location.count === 1 ? "" : "s"}
                </span>
              </div>
              <Accordion type="single" collapsible className="mt-2">
                <AccordionItem
                  value="duplicate-questions"
                  className="border-none"
                >
                  <AccordionTrigger className="rounded-md bg-muted/30 px-3 py-2 text-xs font-semibold hover:no-underline">
                    Duplicate questions
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pt-2">
                    {location.questions.map((question, index) => (
                      <DuplicateQuestionRow
                        key={`${question.questionId}-${index}`}
                        question={question}
                      />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function QuestionActivityModal({
  open,
  onOpenChange,
  title = "Question Details",
  subtitle,
  user,
  headerActions,
  mode = "activity",
  viewType = "questions",
  onViewTypeChange,
  activityItems = [],
  detailItems = [],
  duplicateGroups = [],
  isLoading = false,
  totalCount = 0,
  totalPages = 1,
  currentPage = 1,
  onPageChange,
  onTimelineClick,
  emptyMessage,
  duplicateEmptyMessage = "No duplicate question details for this selection.",
}: QuestionActivityModalProps) {
  const showToggle = mode === "activity" && onViewTypeChange;
  const defaultEmptyMessage =
    mode === "activity" ? `No ${viewType} found.` : "No question details for this selection.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!max-w-6xl flex h-[90vh] max-h-[90vh] w-[90vw] flex-col gap-0 overflow-hidden rounded-2xl p-0 [&>button]:hidden">
        <div className="flex shrink-0 items-center justify-between border-b px-6 pb-4 pt-5">
          <div className="flex items-center justify-start gap-3">
            <DialogHeader className="p-0">
              <DialogTitle className="flex items-center gap-2 text-base font-semibold">
                <Activity className="h-4.5 w-4.5 text-primary" />
                {title}
              </DialogTitle>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </DialogHeader>
            {headerActions}
          </div>

          {showToggle && (
            <div className="flex items-center gap-2.5 rounded-full border bg-muted/40 px-3.5 py-1.5">
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
                onCheckedChange={(checked) =>
                  onViewTypeChange(checked ? "questions" : "messages")
                }
                className="scale-90 data-[state=checked]:bg-primary"
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
          )}
        </div>

        {user && (
          <div className="shrink-0 border-b px-6">
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
                      { label: "Name", value: user.name, icon: User },
                      { label: "Email", value: user.email, icon: Mail },
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
                        className="rounded-lg border bg-muted/40 px-3 py-3"
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 rounded-md bg-primary/10 p-2">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="mb-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                              {label}
                            </p>
                            <p className="truncate text-sm font-medium text-foreground">
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

        <ScrollArea className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-2.5 px-6 py-4">
            {isLoading ? (
              <LoadingState />
            ) : mode === "duplicateGroups" ? (
              duplicateGroups.length ? (
                duplicateGroups.map((group) => (
                  <DuplicateGroupCard key={group.key} group={group} />
                ))
              ) : (
                <EmptyState message={duplicateEmptyMessage} />
              )
            ) : mode === "details" ? (
              detailItems.length ? (
                detailItems.map((question) => (
                  <QuestionDetailCard
                    key={question.questionId}
                    question={question}
                  />
                ))
              ) : (
                <EmptyState message={emptyMessage ?? defaultEmptyMessage} />
              )
            ) : activityItems.length ? (
              activityItems.map((item, index) => (
                <ActivityCard
                  key={item._id ?? index}
                  item={item}
                  viewType={viewType}
                  onTimelineClick={onTimelineClick}
                />
              ))
            ) : (
              <EmptyState message={emptyMessage ?? defaultEmptyMessage} />
            )}
          </div>
        </ScrollArea>

        {mode === "activity" && totalPages > 1 && onPageChange && (
          <div className="flex shrink-0 items-center justify-between border-t bg-muted/10 px-6 py-3.5">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg"
              disabled={currentPage === 1}
              onClick={() => onPageChange(currentPage - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>

            <span className="text-xs font-medium text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 rounded-lg"
              disabled={currentPage === totalPages}
              onClick={() => onPageChange(currentPage + 1)}
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
