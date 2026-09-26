import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import {
  AlertTriangle,
  Loader2,
  RefreshCcw,
  Hourglass,
  ShieldCheck,
  ShieldUser,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetQueueDetails } from "@/hooks/api/question/useGetQueueDetails";
import { useNavigateToQuestion } from "@/hooks/api/question/useNavigateToQuestion";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import type {
  QueueQuestionItem,
  QueueExpertItem,
} from "@/hooks/services/questionService";
import type { AdvanceFilterValues } from "@/components/advanced-question-filter";
import { Section, QuestionRow, ExpertRow } from "./QueueDetailsModal";

/**
 * One column of the Moderator Queue Details modal — the moderator queue for a single
 * source group (time-bound / manual): Waiting / Allocated / Available Moderators.
 */
function ModeratorQueueColumn({
  heading,
  subheading,
  modSuffix,
  moderatorWaiting,
  moderatorAllocated,
  availableModerators,
  dateFilter,
  onQuestionClick,
}: {
  heading: string;
  subheading: string;
  modSuffix: "TimeBound" | "Manual";
  moderatorWaiting: { count: number; items: QueueQuestionItem[] };
  moderatorAllocated: { count: number; items: QueueQuestionItem[] };
  availableModerators: { count: number; items: QueueExpertItem[] };
  dateFilter: { startTime?: Date; endTime?: Date };
  onQuestionClick: (q: QueueQuestionItem) => void;
}) {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const toggle = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

  return (
    <div className="flex-1 min-w-0 space-y-3">
      <div className="sticky top-0 z-10 bg-white dark:bg-[#151515] rounded-lg border border-gray-200 dark:border-gray-800 px-3 py-2">
        <p className="text-sm font-bold text-gray-900 dark:text-white">{heading}</p>
        <p className="text-[11px] text-gray-500">{subheading}</p>
      </div>

      <Section<QueueQuestionItem> icon={<Hourglass size={20} />} color="amber" title="Waiting for Moderator" description="No moderator assigned yet" count={moderatorWaiting.count} section={`moderatorWaiting${modSuffix}`} initialItems={moderatorWaiting.items} renderItem={(q) => <QuestionRow key={q._id} item={q} onClick={() => onQuestionClick(q)} />} isOpen={openSection === `moderatorWaiting${modSuffix}`} onToggle={() => toggle(`moderatorWaiting${modSuffix}`)} emptyText="Nothing waiting for a moderator" startTime={dateFilter.startTime} endTime={dateFilter.endTime} />

      <Section<QueueQuestionItem> icon={<ShieldCheck size={20} />} color="green" title="Allocated to Moderator" description="Assigned to a moderator (incl. re-routed)" count={moderatorAllocated.count} section={`moderatorAllocated${modSuffix}`} initialItems={moderatorAllocated.items} renderItem={(q) => <QuestionRow key={q._id} item={q} showModerator onClick={() => onQuestionClick(q)} />} isOpen={openSection === `moderatorAllocated${modSuffix}`} onToggle={() => toggle(`moderatorAllocated${modSuffix}`)} emptyText="No questions allocated to a moderator" startTime={dateFilter.startTime} endTime={dateFilter.endTime} />

      <Section<QueueExpertItem> icon={<ShieldUser size={20} />} color="violet" title="Available Moderators" description="STF moderators free to take a question" count={availableModerators.count} section={`availableModerators${modSuffix}`} initialItems={availableModerators.items} renderItem={(e) => <ExpertRow key={e._id} item={e} />} isOpen={openSection === `availableModerators${modSuffix}`} onToggle={() => toggle(`availableModerators${modSuffix}`)} emptyText="No available moderators" startTime={dateFilter.startTime} endTime={dateFilter.endTime} />
    </div>
  );
}

export const ModeratorQueueModal = ({
  setIsSidebarOpen,
  currentUserIsAdmin,
  isTrainingUser,
}: {
  setIsSidebarOpen?: (v: boolean) => void;
  currentUserIsAdmin?: boolean;
  isTrainingUser?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const { goToQuestion } = useNavigateToQuestion();

  // Reopen where the user left off after visiting a question (see QueueDetailsModal).
  useEffect(() => {
    if (sessionStorage.getItem("reopenModeratorQueue") === "1") {
      sessionStorage.removeItem("reopenModeratorQueue");
      setOpen(true);
      setIsSidebarOpen?.(false);
    }
  }, [setIsSidebarOpen]);

  const handleQuestionClick = (item: QueueQuestionItem) => {
    sessionStorage.setItem("reopenModeratorQueue", "1");
    setOpen(false);
    goToQuestion(item._id, "moderator_queue");
  };

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
            <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={20} />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                Moderator Queue Details
              </p>
              <p className="text-[11px] text-gray-500">
                Live moderator allocation overview
              </p>
            </div>
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="w-full max-w-[95vw] sm:max-w-[90vw] max-h-[90vh] overflow-y-auto [&_[data-slot=dialog-close]]:size-8 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center [&_[data-slot=dialog-close]]:rounded-md [&_[data-slot=dialog-close]]:opacity-100 [&_[data-slot=dialog-close]]:transition-colors [&_[data-slot=dialog-close]:hover]:bg-muted [&_[data-slot=dialog-close]_svg]:size-5">
        <DialogHeader className="space-y-1 pr-8">
          <DialogTitle className="text-xl flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Moderator Queue Details
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {currentUserIsAdmin || !isTrainingUser
              ? 'Time-bound & manual moderator queues, side by side'
              : 'manual moderator queue'}
          </p>
        </DialogHeader>

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
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading moderator
            queue…
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
            <p className="text-sm text-red-600 dark:text-red-400">
              {error?.message || "Failed to load moderator queue"}
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
          <div className="py-2">
            <div className="flex flex-col lg:flex-row gap-4">
              {(currentUserIsAdmin || !isTrainingUser) && (
                <ModeratorQueueColumn
                  heading="Time-bound Queue"
                  subheading="AjraSakha & WhatsApp (auto-allocated)"
                  modSuffix="TimeBound"
                  moderatorWaiting={data.moderatorWaitingTimeBound}
                  moderatorAllocated={data.moderatorAllocatedTimeBound}
                  availableModerators={data.availableModeratorsTimeBound}
                  dateFilter={{ startTime: dateFilter.startTime ?? undefined, endTime: dateFilter.endTime ?? undefined }}
                  onQuestionClick={handleQuestionClick}
                />
              )}
              <div className="hidden lg:block w-px bg-gray-200 dark:bg-gray-800 self-stretch" />
              <ModeratorQueueColumn
                heading="Manual Queue"
                subheading="AgriExpert & Outreach (single-allocation)"
                modSuffix="Manual"
                moderatorWaiting={data.moderatorWaitingManual}
                moderatorAllocated={data.moderatorAllocatedManual}
                availableModerators={data.availableModeratorsManual}
                dateFilter={{ startTime: dateFilter.startTime ?? undefined, endTime: dateFilter.endTime ?? undefined }}
                onQuestionClick={handleQuestionClick}
              />
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
