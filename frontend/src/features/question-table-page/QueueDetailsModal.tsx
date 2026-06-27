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
  Hourglass,
  ShieldCheck,
  ShieldUser,
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

/** Color config for each known question status used in the received-tab strip. */
const STATUS_TAB_COLOR: Record<
  string,
  { dot: string; active: string; badge: string }
> = {
  open:        { dot: "bg-emerald-500", active: "text-emerald-600 dark:text-emerald-400", badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" },
  delayed:     { dot: "bg-amber-500",   active: "text-amber-600 dark:text-amber-400",     badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300" },
  duplicate:   { dot: "bg-rose-500",    active: "text-rose-600 dark:text-rose-400",        badge: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300" },
  "in-review": { dot: "bg-blue-500",    active: "text-blue-600 dark:text-blue-400",        badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
  closed:      { dot: "bg-gray-400",    active: "text-gray-600 dark:text-gray-400",        badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
  pass:        { dot: "bg-teal-500",    active: "text-teal-600 dark:text-teal-400",        badge: "bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300" },
  hold:        { dot: "bg-orange-500",  active: "text-orange-600 dark:text-orange-400",    badge: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300" },
  "re-routed": { dot: "bg-violet-500",  active: "text-violet-600 dark:text-violet-400",    badge: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" },
  draft:       { dot: "bg-slate-400",   active: "text-slate-600 dark:text-slate-400",      badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  dynamic:     { dot: "bg-slate-400",   active: "text-slate-600 dark:text-slate-400",      badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  all:         { dot: "bg-blue-400",    active: "text-blue-600 dark:text-blue-400",        badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300" },
};
const defaultStatusTabColor = { dot: "bg-purple-400", active: "text-purple-600 dark:text-purple-400", badge: "bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300" };

/** Human-readable elapsed time from a minute count:
 *   < 1 hour   → "40 mins"
 *   < 24 hours → "3 hour 40 mins"
 *   >= 24 hours → "2 days 40 mins" (hours included only when non-zero) */
const formatIdleTime = (mins?: number | null): string => {
  if (mins == null) return "?";
  if (mins < 60) return `${mins} mins`;
  const m = mins % 60;
  if (mins < 1440) {
    const h = Math.floor(mins / 60);
    return `${h} hour ${m} mins`;
  }
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return h > 0 ? `${d} days ${h} hour ${m} mins` : `${d} days ${m} mins`;
};

const QuestionRow = ({
  item,
  showExpert,
  showStuck,
  showWorkType,
  showOpenedIdle,
  showModerator,
  onClick,
}: {
  item: QueueQuestionItem;
  showExpert?: boolean;
  showStuck?: boolean;
  showWorkType?: boolean;
  showOpenedIdle?: boolean;
  showModerator?: boolean;
  onClick?: () => void;
}) => {
  const meta = [item.source, item.state, item.crop].filter(Boolean).join(" · ");
  return (
    <div
      onClick={onClick}
      className={cn(
        "px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0",
        onClick &&
          "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors",
      )}
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
      {showExpert &&
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
          opened {formatIdleTime(item.minutesSinceOpened)} ago · no answer yet
        </p>
      )}
      {showModerator &&
        (item.moderatorName ? (
          <p className="mt-1 text-[11px] font-medium text-gray-700 dark:text-gray-300">
            Moderator: {item.moderatorName}
          </p>
        ) : (
          <p className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Awaiting moderator assignment
          </p>
        ))}
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
  const [openSection, setOpenSection] = useState<string | null>("received");
  // Moderator-queue sub-tab: time-bound (AjraSakha/WhatsApp) vs manual (AgriExpert/Outreach).
  const [modCategory, setModCategory] = useState<"timeBound" | "manual">(
    "timeBound",
  );
  // Auto-Allocate ON sub-tab: OPEN vs DELAYED
  const [autoAllocateTab, setAutoAllocateTab] = useState<"open" | "delayed">("open");
  // Questions Received sub-tab: dynamic per distinct statuses in items
  const [receivedTab, setReceivedTab] = useState<string>("all");
  const { goToQuestion } = useNavigateToQuestion();

  // Opening a question unmounts this modal (the list view is replaced by the question
  // detail). Leave a one-shot flag so when the user exits the question and the modal
  // remounts, it reopens where they left off.
  useEffect(() => {
    if (sessionStorage.getItem("reopenQueueDetails") === "1") {
      sessionStorage.removeItem("reopenQueueDetails");
      setOpen(true);
      setIsSidebarOpen?.(false);
    }
  }, [setIsSidebarOpen]);

  // Close the modal and open the clicked question's detail page.
  const handleQuestionClick = (item: QueueQuestionItem) => {
    sessionStorage.setItem("reopenQueueDetails", "1");
    setOpen(false);
    goToQuestion(item._id, "moderator_queue");
  };

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

  const toggle = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

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
            {/* ── Questions Received — tabbed by status ── */}
            {(() => {
              const allItems = data.received.items;
              // Collect distinct statuses present in page-1 items, preserving a
              // consistent order: open → delayed → duplicate → in-review → others.
              const ORDER = ["open", "delayed", "duplicate", "in-review", "closed", "pass", "hold", "re-routed", "draft", "dynamic"];
              const seen = new Set(allItems.map((q) => q.status?.toLowerCase() ?? ""));
              const tabs = [
                "all",
                ...ORDER.filter((s) => seen.has(s)),
                ...[...seen].filter((s) => !ORDER.includes(s) && s),
              ];
              const filteredItems =
                receivedTab === "all"
                  ? allItems
                  : allItems.filter((q) => q.status?.toLowerCase() === receivedTab);

              return (
                <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1a1a1a]">
                  {/* Header toggle */}
                  <button
                    type="button"
                    onClick={() => toggle("received")}
                    className={cn("w-full flex items-center justify-between p-3 transition-all", colorClasses.blue.ring)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", colorClasses.blue.icon)}>
                        <Inbox size={20} />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">Questions Received</p>
                        <p className="text-[11px] text-gray-500">All time-bound questions received</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={cn("min-w-7 h-7 px-2 rounded-lg flex items-center justify-center text-sm font-bold", colorClasses.blue.badge)}>
                        {data.received.count}
                      </span>
                      <ChevronDown
                        size={16}
                        className={cn("text-gray-400 transition-transform", openSection === "received" && "rotate-180")}
                      />
                    </div>
                  </button>

                  {openSection === "received" && (
                    <div className="border-t border-gray-100 dark:border-gray-800">
                      {data.received.count === 0 ? (
                        <p className="px-3 py-4 text-xs text-gray-400 text-center">No questions received</p>
                      ) : (
                        <>
                          {/* Status tab strip */}
                          <div className="flex flex-wrap items-center gap-1 m-2 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-[#111]">
                            {tabs.map((tab) => {
                              const count = tab === "all" ? allItems.length : allItems.filter((q) => q.status?.toLowerCase() === tab).length;
                              const col = STATUS_TAB_COLOR[tab] ?? defaultStatusTabColor;
                              return (
                                <button
                                  key={tab}
                                  type="button"
                                  onClick={() => setReceivedTab(tab)}
                                  className={cn(
                                    "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap",
                                    receivedTab === tab
                                      ? `bg-white shadow-sm dark:bg-gray-800 ${col.active}`
                                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
                                  )}
                                >
                                  <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", col.dot)} />
                                  {tab === "all" ? "ALL" : tab.toUpperCase()}
                                  <span className={cn("ml-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold", col.badge)}>
                                    {count}
                                  </span>
                                </button>
                              );
                            })}
                          </div>

                          {/* Filtered list */}
                          {filteredItems.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-gray-400 text-center">
                              No {receivedTab} questions
                            </p>
                          ) : (
                            <div className="max-h-72 overflow-y-auto">
                              {filteredItems.map((q) => (
                                <QuestionRow key={q._id} item={q} onClick={() => handleQuestionClick(q)} />
                              ))}
                            </div>
                          )}

                          {/* Note: counts show page-1 items only; full counts are in the header badge */}
                          {data.received.count > allItems.length && (
                            <p className="px-3 py-2 text-[11px] text-gray-400 text-center border-t border-gray-100 dark:border-gray-800">
                              Showing first {allItems.length} of {data.received.count} — use pagination for more
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── Auto-Allocate ON — with OPEN / DELAYED sub-tabs ── */}
            <div className="border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-[#1a1a1a]">
              {/* Header row (acts as toggle) */}
              <button
                type="button"
                onClick={() => toggle("autoAllocateOff")}
                className={cn(
                  "w-full flex items-center justify-between p-3 transition-all",
                  colorClasses.slate.ring,
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", colorClasses.slate.icon)}>
                    <Power size={20} />
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Auto-Allocate ON</p>
                    <p className="text-[11px] text-gray-500">AjraSakha / WhatsApp, auto-allocated (open / delayed)</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("min-w-7 h-7 px-2 rounded-lg flex items-center justify-center text-sm font-bold", colorClasses.slate.badge)}>
                    {data.autoAllocateOff.count}
                  </span>
                  <ChevronDown
                    size={16}
                    className={cn("text-gray-400 transition-transform", openSection === "autoAllocateOff" && "rotate-180")}
                  />
                </div>
              </button>

              {openSection === "autoAllocateOff" && (
                <div className="border-t border-gray-100 dark:border-gray-800">
                  {/* OPEN / DELAYED tab strip */}
                  <div className="flex items-center gap-1 m-2 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-[#111]">
                    {(["open", "delayed"] as const).map((tab) => {
                      const tabItems = data.autoAllocateOff.items.filter(
                        (q) => q.status?.toLowerCase() === tab,
                      );
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setAutoAllocateTab(tab)}
                          className={cn(
                            "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                            autoAllocateTab === tab
                              ? tab === "open"
                                ? "bg-white text-emerald-600 shadow-sm dark:bg-gray-800 dark:text-emerald-400"
                                : "bg-white text-amber-600 shadow-sm dark:bg-gray-800 dark:text-amber-400"
                              : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              tab === "open" ? "bg-emerald-500" : "bg-amber-500",
                            )}
                          />
                          {tab.toUpperCase()}
                          <span
                            className={cn(
                              "ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold",
                              tab === "open"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                : "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
                            )}
                          >
                            {tabItems.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Filtered question list */}
                  {(() => {
                    const filtered = data.autoAllocateOff.items.filter(
                      (q) => q.status?.toLowerCase() === autoAllocateTab,
                    );
                    if (filtered.length === 0) {
                      return (
                        <p className="px-3 py-4 text-xs text-gray-400 text-center">
                          No {autoAllocateTab} questions
                        </p>
                      );
                    }
                    return (
                      <div className="max-h-72 overflow-y-auto">
                        {filtered.map((q) => (
                          <QuestionRow
                            key={q._id}
                            item={q}
                            onClick={() => handleQuestionClick(q)}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>

            {/* ── Time-bound work, segregated by type ── */}
            <Section<QueueQuestionItem>
              icon={<Clock size={20} />}
              color="amber"
              title="Never Allocated"
              description="Time-bound questions not yet assigned to any expert"
              count={data.waiting.count}
              section="waiting"
              initialItems={data.waiting.items}
              renderItem={(q) => <QuestionRow key={q._id} item={q} onClick={() => handleQuestionClick(q)} />}
              isOpen={openSection === "waiting"}
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
              renderItem={(q) => <QuestionRow key={q._id} item={q} showStuck onClick={() => handleQuestionClick(q)} />}
              isOpen={openSection === "stuck"}
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
              renderItem={(q) => <QuestionRow key={q._id} item={q} showOpenedIdle onClick={() => handleQuestionClick(q)} />}
              isOpen={openSection === "openedIdle"}
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
              renderItem={(q) => <QuestionRow key={q._id} item={q} showExpert onClick={() => handleQuestionClick(q)} />}
              isOpen={openSection === "needsReviewer"}
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
                <QuestionRow key={q._id} item={q} showExpert onClick={() => handleQuestionClick(q)} />
              )}
              isOpen={openSection === "allocated"}
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
              isOpen={openSection === "freeExperts"}
              onToggle={() => toggle("freeExperts")}
              emptyText="No free experts"
              startTime={dateFilter.startTime ?? undefined}
              endTime={dateFilter.endTime ?? undefined}
            />

            {/* ── Moderator queue ── */}
            <div className="flex items-center gap-3 pt-2">
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Moderator Queue
              </span>
              <div className="h-px flex-1 bg-gray-200 dark:bg-gray-800" />
            </div>

            {/* Time-bound / Manual toggle — switches all three moderator sections
                below between the two source groups. */}
            <div className="flex w-full items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-800 dark:bg-[#1a1a1a]">
              {(
                [
                  { id: "timeBound", label: "Time-bound" },
                  { id: "manual", label: "Manual" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setModCategory(tab.id)}
                  className={cn(
                    "flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    modCategory === tab.id
                      ? "bg-white text-blue-600 shadow-sm dark:bg-gray-800 dark:text-blue-400"
                      : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {(() => {
              const isTB = modCategory === "timeBound";
              const sourceLabel = isTB
                ? "AjraSakha / WhatsApp"
                : "AgriExpert / Outreach";
              const cfg = isTB
                ? {
                    waiting: {
                      section: "moderatorWaitingTimeBound",
                      data: data.moderatorWaitingTimeBound,
                    },
                    allocated: {
                      section: "moderatorAllocatedTimeBound",
                      data: data.moderatorAllocatedTimeBound,
                    },
                    available: {
                      section: "availableModeratorsTimeBound",
                      data: data.availableModeratorsTimeBound,
                    },
                  }
                : {
                    waiting: {
                      section: "moderatorWaitingManual",
                      data: data.moderatorWaitingManual,
                    },
                    allocated: {
                      section: "moderatorAllocatedManual",
                      data: data.moderatorAllocatedManual,
                    },
                    available: {
                      section: "availableModeratorsManual",
                      data: data.availableModeratorsManual,
                    },
                  };

              return (
                <>
                  <Section<QueueQuestionItem>
                    icon={<Hourglass size={20} />}
                    color="amber"
                    title="Waiting for Moderator"
                    description={`${sourceLabel} — no moderator assigned yet`}
                    count={cfg.waiting.data?.count ?? 0}
                    section={cfg.waiting.section}
                    initialItems={cfg.waiting.data?.items ?? []}
                    renderItem={(q) => (
                      <QuestionRow key={q._id} item={q} onClick={() => handleQuestionClick(q)} />
                    )}
                    isOpen={openSection === cfg.waiting.section}
                    onToggle={() => toggle(cfg.waiting.section)}
                    emptyText="Nothing waiting for a moderator"
                    startTime={dateFilter.startTime ?? undefined}
                    endTime={dateFilter.endTime ?? undefined}
                  />

                  <Section<QueueQuestionItem>
                    icon={<ShieldCheck size={20} />}
                    color="green"
                    title="Allocated to Moderator"
                    description={`${sourceLabel} — assigned to a moderator (incl. re-routed)`}
                    count={cfg.allocated.data?.count ?? 0}
                    section={cfg.allocated.section}
                    initialItems={cfg.allocated.data?.items ?? []}
                    renderItem={(q) => (
                      <QuestionRow key={q._id} item={q} showModerator onClick={() => handleQuestionClick(q)} />
                    )}
                    isOpen={openSection === cfg.allocated.section}
                    onToggle={() => toggle(cfg.allocated.section)}
                    emptyText="No questions allocated to a moderator"
                    startTime={dateFilter.startTime ?? undefined}
                    endTime={dateFilter.endTime ?? undefined}
                  />

                  <Section<QueueExpertItem>
                    icon={<ShieldUser size={20} />}
                    color="violet"
                    title="Available Moderators"
                    description={`STF moderators free to take a ${
                      isTB ? "time-bound" : "manual"
                    } question`}
                    count={cfg.available.data?.count ?? 0}
                    section={cfg.available.section}
                    initialItems={cfg.available.data?.items ?? []}
                    renderItem={(e) => <ExpertRow key={e._id} item={e} />}
                    isOpen={openSection === cfg.available.section}
                    onToggle={() => toggle(cfg.available.section)}
                    emptyText="No available moderators"
                    startTime={dateFilter.startTime ?? undefined}
                    endTime={dateFilter.endTime ?? undefined}
                  />
                </>
              );
            })()}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
