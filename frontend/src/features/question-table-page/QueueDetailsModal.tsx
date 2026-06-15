import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  UserCheck,
  Clock,
  Users,
  AlertTriangle,
  Loader2,
  ListChecks,
  RefreshCcw,
  Power,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetQueueDetails } from "@/hooks/api/question/useGetQueueDetails";
import { useGetQueueSection } from "@/hooks/api/question/useGetQueueSection";
import { useNavigateToQuestion } from "@/hooks/api/question/useNavigateToQuestion";
import type {
  QueueQuestionItem,
  QueueExpertItem,
} from "@/hooks/services/questionService";
import { formatDate } from "@/utils/formatDate";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";

type SectionColor = "blue" | "green" | "amber" | "violet" | "red" | "slate";

const colorClasses: Record<
  SectionColor,
  { icon: string; ring: string; badge: string }
> = {
  blue: {
    icon: "bg-blue-100 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    ring: "hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/5",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  },
  green: {
    icon: "bg-green-100 dark:bg-green-500/10 text-green-600 dark:text-green-400",
    ring: "hover:border-green-500/50 hover:bg-green-50 dark:hover:bg-green-500/5",
    badge:
      "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
  },
  amber: {
    icon: "bg-amber-100 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    ring: "hover:border-amber-500/50 hover:bg-amber-50 dark:hover:bg-amber-500/5",
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  violet: {
    icon: "bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
    ring: "hover:border-violet-500/50 hover:bg-violet-50 dark:hover:bg-violet-500/5",
    badge:
      "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
  },
  red: {
    icon: "bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400",
    ring: "hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-500/5",
    badge: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
  slate: {
    icon: "bg-slate-100 dark:bg-slate-500/10 text-slate-600 dark:text-slate-400",
    ring: "hover:border-slate-500/50 hover:bg-slate-50 dark:hover:bg-slate-500/5",
    badge:
      "bg-slate-100 text-slate-700 dark:bg-slate-500/15 dark:text-slate-300",
  },
};

const WORK_TYPE_LABEL: Record<
  NonNullable<QueueQuestionItem["workType"]>,
  string
> = {
  stuck: "Stuck",
  unallocated: "Unallocated",
  needsReviewer: "Needs Reviewer",
};

const QuestionRow = ({
  item,
  showExpert,
  showStuck,
  showWorkType,
  showOpenedIdle,
  onClick,
}: {
  item: QueueQuestionItem;
  showExpert?: boolean;
  showStuck?: boolean;
  showWorkType?: boolean;
  showOpenedIdle?: boolean;
  onClick?: () => void;
}) => {
  const meta = [item.source, item.state, item.crop].filter(Boolean).join(" · ");
  return (
    <div
      onClick={onClick}
      className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
        {item.question || "(no text)"}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
        {showWorkType && item.workType && (
          <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 font-medium uppercase tracking-wide">
            {WORK_TYPE_LABEL[item.workType]}
          </span>
        )}
        {item.status && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-medium uppercase tracking-wide">
            {item.status}
          </span>
        )}
        {item.priority && <span>· {item.priority}</span>}
        {meta && <span>{meta}</span>}
        {item.createdAt && <span>· {formatDate(new Date(item.createdAt))}</span>}
      </div>
      {/* Full queue with levels (Author, Reviewer 1, …) — shown for any section
          whose question has an allocation queue. Allocated shows plain names plus
          a single status for the current person (Completed / Waiting). */}
      {item.queueExpertNames && item.queueExpertNames.length > 0 && (
        <p className="mt-1 text-[11px] font-medium text-gray-700 dark:text-gray-300 flex flex-wrap items-center gap-1.5">
          <span>Queue: {item.queueExpertNames.join(", ")}</span>
          {item.lastPersonStatus && (
            <span
              className={
                item.lastPersonStatus === "completed"
                  ? "px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300 uppercase tracking-wide"
                  : "px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 uppercase tracking-wide"
              }
            >
              {item.lastPersonStatus === "completed" ? "Completed" : "Waiting"}
            </span>
          )}
        </p>
      )}
      {showExpert &&
        !(item.queueExpertNames && item.queueExpertNames.length > 0) &&
        (item.expertName ? (
          <p className="mt-1 text-[11px] font-medium text-gray-700 dark:text-gray-300">
            Expert: {item.expertName}
          </p>
        ) : (
          <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Awaiting reviewer assignment
          </p>
        ))}
      {showStuck && (
        <p className="mt-1 text-[11px] font-medium text-red-600 dark:text-red-400">
          {item.expertName ? `${item.expertName} · ` : ""}
          stuck {item.minutesSinceAllocated ?? "?"} min (never opened)
        </p>
      )}
      {showOpenedIdle && (
        <p className="mt-1 text-[11px] font-medium text-orange-600 dark:text-orange-400">
          {item.expertName ? `${item.expertName} · ` : ""}
          opened {item.minutesSinceOpened ?? "?"} min ago · no answer yet
        </p>
      )}
    </div>
  );
};

const ExpertRow = ({ item }: { item: QueueExpertItem }) => (
  <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 flex items-center justify-between gap-2">
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {item.name}
        </p>
        {item.isSpecialTaskForce ? (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300">
            STF
          </span>
        ) : (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
            Non-STF
          </span>
        )}
      </div>
      {item.email && (
        <p className="text-[11px] text-gray-500 truncate">{item.email}</p>
      )}
    </div>
    {item.role && (
      <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 uppercase shrink-0">
        {item.role}
      </span>
    )}
  </div>
);

const PAGE_SIZE = 50;

type SectionProps<T> = {
  icon: React.ReactNode;
  color: SectionColor;
  title: string;
  description: string;
  /** Exact total (from the main query) — drives the count badge + total pages. */
  count: number;
  /** Backend section key used to fetch pages > 1. */
  section: string;
  /** Page-1 items already loaded by the main query. */
  initialItems: T[];
  renderItem: (item: T) => React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  emptyText: string;
  startTime?: Date;
  endTime?: Date;
};

function Section<T>({
  icon,
  color,
  title,
  description,
  count,
  section,
  initialItems,
  renderItem,
  isOpen,
  onToggle,
  emptyText,
  startTime,
  endTime,
}: SectionProps<T>) {
  const c = colorClasses[color];
  const [page, setPage] = useState(1);

  // Reset to page 1 when the data refreshes (page-1 items change) or on reopen.
  useEffect(() => {
    setPage(1);
  }, [initialItems, isOpen]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  // Page 1 comes from the main query; pages > 1 are fetched from the backend.
  const needFetch = isOpen && safePage > 1;
  const { data: sectionData, isFetching } = useGetQueueSection(
    section,
    safePage,
    PAGE_SIZE,
    needFetch,
    startTime,
    endTime,
  );

  const pageItems: T[] =
    safePage === 1 ? initialItems : ((sectionData?.items as T[] | undefined) ?? []);
  const isPageLoading = needFetch && isFetching;
  const start = (safePage - 1) * PAGE_SIZE;

  const pagerBtn =
    "p-1 rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:pointer-events-none transition-colors";

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1a1a1a]">
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center justify-between p-3 transition-all",
          c.ring,
        )}
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
              c.icon,
            )}
          >
            {icon}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              {title}
            </p>
            <p className="text-[11px] text-gray-500">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "min-w-7 h-7 px-2 rounded-lg flex items-center justify-center text-sm font-bold",
              c.badge,
            )}
          >
            {count}
          </span>
          <ChevronDown
            size={16}
            className={cn(
              "text-gray-400 transition-transform",
              isOpen && "rotate-180",
            )}
          />
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-gray-100 dark:border-gray-800">
          {count === 0 ? (
            <p className="px-3 py-4 text-xs text-gray-400 text-center">
              {emptyText}
            </p>
          ) : (
            <>
              <div className="max-h-72 overflow-y-auto">
                {isPageLoading && pageItems.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading…
                  </div>
                ) : (
                  pageItems.map(renderItem)
                )}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-100 dark:border-gray-800">
                  <span className="text-[11px] text-gray-400">
                    Showing {start + 1}–{Math.min(start + PAGE_SIZE, count)} of{" "}
                    {count}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {isFetching && (
                      <Loader2 className="h-3 w-3 animate-spin text-gray-400" />
                    )}
                    <button
                      type="button"
                      className={pagerBtn}
                      disabled={safePage <= 1 || isPageLoading}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      aria-label="Previous page"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 tabular-nums px-1">
                      {safePage} / {totalPages}
                    </span>
                    <button
                      type="button"
                      className={pagerBtn}
                      disabled={safePage >= totalPages || isPageLoading}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      aria-label="Next page"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export const QueueDetailsModal = ({
  setIsSidebarOpen,
}: {
  setIsSidebarOpen?: (v: boolean) => void;
}) => {
  const [open, setOpen] = useState(false);
  // Sections are independently collapsible — opening one no longer closes the others,
  // so the user can view e.g. "Never Allocated" and "Available Experts" at the same time.
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set(["received"]),
  );

  // Date filter state - default to current date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const [dateFilter, setDateFilter] = useState<Partial<AdvanceFilterValues>>({
    startTime: today,
    endTime: tomorrow,
  });
  
  const { data, isLoading, isError, error, refetch, isFetching } =
    useGetQueueDetails(
      open,
      dateFilter.startTime ?? undefined,
      dateFilter.endTime ?? undefined,
    );

  const { goToQuestion } = useNavigateToQuestion();

  // Opening a question unmounts this modal (the list view is replaced by the
  // question detail). Leave a one-shot flag so that when the user exits the
  // question and the modal remounts, it reopens where they left off.
  useEffect(() => {
    if (sessionStorage.getItem("reopenQueueDetails") === "1") {
      sessionStorage.removeItem("reopenQueueDetails");
      setOpen(true);
      setIsSidebarOpen?.(false);
    }
  }, [setIsSidebarOpen]);

  const handleQuestionClick = (item: QueueQuestionItem) => {
    sessionStorage.setItem("reopenQueueDetails", "1");
    setOpen(false);
    goToQuestion(item._id, "moderator_queue");
  };

  const toggle = (key: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const handleDateFilterChange = (key: string, value: Date | undefined) => {
    setDateFilter((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) setIsSidebarOpen?.(false);
      }}
    >
      <DialogTrigger asChild>
        <button className="w-full flex items-center justify-between p-4 bg-white dark:bg-[#1a1a1a] hover:bg-blue-50 dark:hover:bg-blue-500/5 border border-gray-200 dark:border-gray-800 hover:border-blue-500/50 rounded-xl group transition-all shadow-sm dark:shadow-none">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400">
              <ListChecks size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                Queue Details
              </p>
              <p className="text-[11px] text-gray-500">
                Live allocation & expert queue overview
              </p>
            </div>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="w-full max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center [&_[data-slot=dialog-close]]:rounded-md [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:transition-colors [&_[data-slot=dialog-close]:hover]:bg-muted [&_[data-slot=dialog-close]_svg]:size-5">
        <DialogHeader className="space-y-1 pr-8">
          <DialogTitle className="text-xl flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Queue Details
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Time-bound questions (AjraSakha &amp; WhatsApp, auto-allocated)
          </p>
        </DialogHeader>

        {/* Controls bar — date filter + refresh, separated from the title row */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Filter by
            </span>
            <DateRangeFilter
              advanceFilter={dateFilter}
              handleDialogChange={handleDateFilterChange}
              customName="Created At"
              type="createdAt"
              className="w-[200px] [&>label]:hidden"
            />
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-60 transition-colors"
          >
            <RefreshCcw size={13} className={cn(isFetching && "animate-spin")} />
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading queue
            details…
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">
              {error?.message || "Failed to load queue details"}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-3 text-xs font-medium text-blue-600 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : data ? (
          <div className="space-y-3 py-2">
            <Section<QueueQuestionItem>
              icon={<Inbox size={20} />}
              color="blue"
              title="Questions Received"
              description="All time-bound questions received"
              count={data.received.count}
              section="received"
              initialItems={data.received.items}
              renderItem={(q) => (
                <QuestionRow
                  key={q._id}
                  item={q}
                  onClick={() => handleQuestionClick(q)}
                />
              )}
              isOpen={openSections.has("received")}
              onToggle={() => toggle("received")}
              emptyText="No questions received"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            <Section<QueueQuestionItem>
              icon={<Power size={20} />}
              color="slate"
              title="Auto-Allocate ON"
              description="AjraSakha / WhatsApp, auto-allocated (open / delayed)"
              count={data.autoAllocateOff.count}
              section="autoAllocateOff"
              initialItems={data.autoAllocateOff.items}
              renderItem={(q) => (
                <QuestionRow
                  key={q._id}
                  item={q}
                  onClick={() => handleQuestionClick(q)}
                />
              )}
              isOpen={openSections.has("autoAllocateOff")}
              onToggle={() => toggle("autoAllocateOff")}
              emptyText="No auto-allocate-on questions"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            {/* ── Time-bound work, segregated by type ── */}
            <Section<QueueQuestionItem>
              icon={<Clock size={20} />}
              color="amber"
              title="Never Allocated"
              description="Time-bound questions not yet assigned to any expert"
              count={data.waiting.count}
              section="waiting"
              initialItems={data.waiting.items}
              renderItem={(q) => (
                <QuestionRow
                  key={q._id}
                  item={q}
                  onClick={() => handleQuestionClick(q)}
                />
              )}
              isOpen={openSections.has("waiting")}
              onToggle={() => toggle("waiting")}
              emptyText="Nothing waiting for allocation"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            <Section<QueueQuestionItem>
              icon={<AlertTriangle size={20} />}
              color="red"
              title="Stuck Questions (> 45 min)"
              description="Allocated > 45 min but never opened by the expert"
              count={data.stuck.count}
              section="stuck"
              initialItems={data.stuck.items}
              renderItem={(q) => (
                <QuestionRow
                  key={q._id}
                  item={q}
                  showStuck
                  onClick={() => handleQuestionClick(q)}
                />
              )}
              isOpen={openSections.has("stuck")}
              onToggle={() => toggle("stuck")}
              emptyText="No stuck questions"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            <Section<QueueQuestionItem>
              icon={<Clock size={20} />}
              color="amber"
              title="Opened but Idle (> 45 min)"
              description="Opened by the expert > 45 min ago but still no answer"
              count={data.openedIdle.count}
              section="openedIdle"
              initialItems={data.openedIdle.items}
              renderItem={(q) => (
                <QuestionRow
                  key={q._id}
                  item={q}
                  showOpenedIdle
                  onClick={() => handleQuestionClick(q)}
                />
              )}
              isOpen={openSections.has("openedIdle")}
              onToggle={() => toggle("openedIdle")}
              emptyText="No opened-but-idle questions"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            <Section<QueueQuestionItem>
              icon={<UserPlus size={20} />}
              color="violet"
              title="Needs Reviewer"
              description="Answered/reviewed, awaiting the next reviewer"
              count={data.needsReviewer.count}
              section="needsReviewer"
              initialItems={data.needsReviewer.items}
              renderItem={(q) => (
                <QuestionRow
                  key={q._id}
                  item={q}
                  showExpert
                  onClick={() => handleQuestionClick(q)}
                />
              )}
              isOpen={openSections.has("needsReviewer")}
              onToggle={() => toggle("needsReviewer")}
              emptyText="Nothing waiting for a reviewer"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            <Section<QueueQuestionItem>
              icon={<UserCheck size={20} />}
              color="green"
              title="Questions Allocated"
              description="Assigned to an expert"
              count={data.allocated.count}
              section="allocated"
              initialItems={data.allocated.items}
              renderItem={(q) => (
                <QuestionRow
                  key={q._id}
                  item={q}
                  showExpert
                  onClick={() => handleQuestionClick(q)}
                />
              )}
              isOpen={openSections.has("allocated")}
              onToggle={() => toggle("allocated")}
              emptyText="No allocated questions"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            <Section<QueueExpertItem>
              icon={<Users size={20} />}
              color="violet"
              title="Experts Waiting in Queue"
              description="Experts free with no active allocation"
              count={data.freeExperts.count}
              section="freeExperts"
              initialItems={data.freeExperts.items}
              renderItem={(e) => <ExpertRow key={e._id} item={e} />}
              isOpen={openSections.has("freeExperts")}
              onToggle={() => toggle("freeExperts")}
              emptyText="No free experts"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
