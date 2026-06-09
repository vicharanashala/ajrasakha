import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import {
  ChevronDown,
  Inbox,
  UserCheck,
  Clock,
  Users,
  AlertTriangle,
  Loader2,
  ListChecks,
  RefreshCcw,
  PowerOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetQueueDetails } from "@/hooks/api/question/useGetQueueDetails";
import type {
  QueueQuestionItem,
  QueueExpertItem,
} from "@/hooks/services/questionService";
import { formatDate } from "@/utils/formatDate";

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

const QuestionRow = ({
  item,
  showExpert,
  showStuck,
}: {
  item: QueueQuestionItem;
  showExpert?: boolean;
  showStuck?: boolean;
}) => {
  const meta = [item.source, item.state, item.crop].filter(Boolean).join(" · ");
  return (
    <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0">
      <p className="text-sm text-gray-900 dark:text-gray-100 line-clamp-2">
        {item.question || "(no text)"}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
        {item.status && (
          <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-medium uppercase tracking-wide">
            {item.status}
          </span>
        )}
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
    </div>
  );
};

const ExpertRow = ({ item }: { item: QueueExpertItem }) => (
  <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800 last:border-0 flex items-center justify-between gap-2">
    <div className="min-w-0">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
        {item.name}
      </p>
      {item.email && (
        <p className="text-[11px] text-gray-500 truncate">{item.email}</p>
      )}
    </div>
    {typeof item.reputationScore === "number" && (
      <span className="text-[11px] text-gray-500 shrink-0">
        score {item.reputationScore}
      </span>
    )}
  </div>
);

type SectionProps = {
  icon: React.ReactNode;
  color: SectionColor;
  title: string;
  description: string;
  count: number;
  shownCount: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  emptyText: string;
};

const Section = ({
  icon,
  color,
  title,
  description,
  count,
  shownCount,
  isOpen,
  onToggle,
  children,
  emptyText,
}: SectionProps) => {
  const c = colorClasses[color];
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
              <div className="max-h-72 overflow-y-auto">{children}</div>
              {count > shownCount && (
                <p className="px-3 py-2 text-[11px] text-gray-400 text-center border-t border-gray-100 dark:border-gray-800">
                  Showing latest {shownCount} of {count}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export const QueueDetailsModal = ({
  setIsSidebarOpen,
}: {
  setIsSidebarOpen?: (v: boolean) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("received");
  const { data, isLoading, isError, error, refetch, isFetching } =
    useGetQueueDetails(open);

  const toggle = (key: string) =>
    setOpenSection((prev) => (prev === key ? null : key));

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

      <DialogContent className="sm:max-w-2xl max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Queue Details
            <button
              type="button"
              onClick={() => refetch()}
              className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
            >
              <RefreshCcw
                size={13}
                className={cn(isFetching && "animate-spin")}
              />
              Refresh
            </button>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Time-bound questions (AjraSakha &amp; WhatsApp, auto-allocated)
          </p>
        </DialogHeader>

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
            <Section
              icon={<Inbox size={20} />}
              color="blue"
              title="Questions Received"
              description="All time-bound questions received"
              count={data.received.count}
              shownCount={data.received.items.length}
              isOpen={openSection === "received"}
              onToggle={() => toggle("received")}
              emptyText="No questions received"
            >
              {data.received.items.map((q) => (
                <QuestionRow key={q._id} item={q} />
              ))}
            </Section>

            <Section
              icon={<PowerOff size={20} />}
              color="slate"
              title="Auto-Allocation OFF"
              description="AjraSakha / WhatsApp, handled manually"
              count={data.autoAllocateOff.count}
              shownCount={data.autoAllocateOff.items.length}
              isOpen={openSection === "autoAllocateOff"}
              onToggle={() => toggle("autoAllocateOff")}
              emptyText="No auto-allocation-off questions"
            >
              {data.autoAllocateOff.items.map((q) => (
                <QuestionRow key={q._id} item={q} />
              ))}
            </Section>

            <Section
              icon={<UserCheck size={20} />}
              color="green"
              title="Questions Allocated"
              description="Assigned to an expert"
              count={data.allocated.count}
              shownCount={data.allocated.items.length}
              isOpen={openSection === "allocated"}
              onToggle={() => toggle("allocated")}
              emptyText="No allocated questions"
            >
              {data.allocated.items.map((q) => (
                <QuestionRow key={q._id} item={q} showExpert />
              ))}
            </Section>

            <Section
              icon={<Clock size={20} />}
              color="amber"
              title="Waiting for Expert"
              description="Received but not yet allocated"
              count={data.waiting.count}
              shownCount={data.waiting.items.length}
              isOpen={openSection === "waiting"}
              onToggle={() => toggle("waiting")}
              emptyText="Nothing waiting for allocation"
            >
              {data.waiting.items.map((q) => (
                <QuestionRow key={q._id} item={q} />
              ))}
            </Section>

            <Section
              icon={<Users size={20} />}
              color="violet"
              title="Experts Waiting in Queue"
              description="Experts free with no active allocation"
              count={data.freeExperts.count}
              shownCount={data.freeExperts.items.length}
              isOpen={openSection === "freeExperts"}
              onToggle={() => toggle("freeExperts")}
              emptyText="No free experts"
            >
              {data.freeExperts.items.map((e) => (
                <ExpertRow key={e._id} item={e} />
              ))}
            </Section>

            <Section
              icon={<AlertTriangle size={20} />}
              color="red"
              title="Stuck Questions"
              description="Allocated > 45 min, never opened"
              count={data.stuck.count}
              shownCount={data.stuck.items.length}
              isOpen={openSection === "stuck"}
              onToggle={() => toggle("stuck")}
              emptyText="No stuck questions"
            >
              {data.stuck.items.map((q) => (
                <QuestionRow key={q._id} item={q} showStuck />
              ))}
            </Section>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
