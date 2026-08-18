import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";
import CountUp from "react-countup";
import { Database, InfoIcon, Percent, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/atoms/skeleton";
import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import {
  useDatasetQuestionsList,
  useDatasetFeedbacksList,
  useDatasetUsersList,
  type DatasetQuestionListItem,
  type DatasetFeedbackListItem,
  type DatasetUserListItem,
} from "./hooks/useDashboardData";
import { DatasetListModal } from "./components/DatasetListModal";
import type { ReusableTableColumn } from "./components/ReusableDataTable";

const DATASET_LIST_PAGE_SIZE = 10;

function formatDatasetDate(value?: string) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}

type ActiveDatasetList = "questions" | "feedbacks" | "users" | null;

type DatasetQuestionsFeedbackCardProps = {
  totalQuestions?: number;
  totalFeedbacks?: number;
  totalUsers?: number;
  isLoading?: boolean;
};

export function DatasetQuestionsFeedbackCard({
  totalQuestions,
  totalFeedbacks,
  totalUsers,
  isLoading,
}: DatasetQuestionsFeedbackCardProps) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await queryClient.invalidateQueries({ queryKey: ["dataset-totals"] });
    setRefreshing(false);
  }, [queryClient]);

  const safeQuestions = totalQuestions ?? 0;
  const safeFeedbacks = totalFeedbacks ?? 0;
  const safeUsers = totalUsers ?? 0;
  const feedbackPct =
    safeQuestions > 0 ? (safeFeedbacks / safeQuestions) * 100 : 0;

  
  const [activeList, setActiveList] = useState<ActiveDatasetList>(null);
  const [listPage, setListPage] = useState(1);

  const openList = useCallback((list: Exclude<ActiveDatasetList, null>) => {
    setActiveList(list);
    setListPage(1);
  }, []);
  const closeList = useCallback(() => {
    setActiveList(null);
    setListPage(1);
  }, []);

  const questionsListQuery = useDatasetQuestionsList(
    listPage,
    DATASET_LIST_PAGE_SIZE,
    activeList === "questions",
  );
  const feedbacksListQuery = useDatasetFeedbacksList(
    listPage,
    DATASET_LIST_PAGE_SIZE,
    activeList === "feedbacks",
  );
  const usersListQuery = useDatasetUsersList(
    listPage,
    DATASET_LIST_PAGE_SIZE,
    activeList === "users",
  );

  const questionColumns = useMemo<ReusableTableColumn<DatasetQuestionListItem>[]>(
    () => [
      { key: "questionId", header: "Question ID", render: (r) => r.questionId || "-" },
      { key: "question", header: "Question", render: (r) => r.question || "-" },
      {
        key: "createdAt",
        header: "Created At",
        render: (r) => formatDatasetDate(r.createdAt),
      },
    ],
    [],
  );

  const feedbackColumns = useMemo<ReusableTableColumn<DatasetFeedbackListItem>[]>(
    () => [
      { key: "email", header: "Email", render: (r) => r.email || "-" },
      { key: "questionId", header: "Question ID", render: (r) => r.questionId || "-" },
      { key: "tag", header: "Tag", render: (r) => r.tag || "-" },
      { key: "type", header: "Type", render: (r) => r.type || "-" },
      {
        key: "predefinedOption",
        header: "Predefined Option",
        render: (r) => r.predefinedOption || "-",
      },
      {
        key: "comment",
        header: "Comment",
        className: "max-w-[220px] truncate",
        render: (r) => r.comment || "-",
      },
      {
        key: "reviewNote",
        header: "Review Note",
        className: "max-w-[220px] truncate",
        render: (r) => r.reviewNote || "-",
      },
      { key: "status", header: "Status", render: (r) => r.status || "-" },
      {
        key: "createdAt",
        header: "Created At",
        render: (r) => formatDatasetDate(r.createdAt),
      },
    ],
    [],
  );

  const userColumns = useMemo<ReusableTableColumn<DatasetUserListItem>[]>(
    () => [
      { key: "name", header: "Name", render: (r) => r.name || "-" },
      { key: "email", header: "Email", render: (r) => r.email || "-" },
      { key: "phone", header: "Phone", render: (r) => r.phone || "-" },
      { key: "age", header: "Age", render: (r) => r.age ?? "-" },
      {
        key: "createdAt",
        header: "Created At",
        render: (r) => formatDatasetDate(r.createdAt),
      },
    ],
    [],
  );

  return (
    <div
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-2xl",
        "bg-gradient-to-br from-card via-card to-card/40",
        "ring-1 ring-border/60 transition-all duration-300",
        "hover:ring-border hover:shadow-lg hover:shadow-primary/5",
      )}
    >
      {/* Decorative top accent */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="flex flex-1 flex-col p-5">
        {isLoading || refreshing ? (
          <div className="space-y-5">
            <Skeleton className="h-4 w-44" />
            <div className="grid grid-cols-3 gap-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          </div>
        ) : (
          <TooltipProvider delayDuration={200}>
            <div className="flex flex-1 flex-col justify-between space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
                    <Database className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold tracking-tight text-foreground">
                        Dataset Questions and Feedback Metrics
                      </span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <InfoIcon className="h-3 w-3 cursor-help text-muted-foreground/60" />
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[240px]">
                          <p className="text-xs leading-relaxed">
                            All-time dataset totals across questions asked,
                            feedback received, and registered users.
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      All-time totals
                    </span>
                  </div>
                </div>

                <button
                  onClick={handleRefresh}
                  className="rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
                  title="Refresh"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 bg-background ${
                      refreshing ? "animate-spin" : ""
                    }`}
                  />
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2.5">
                <StatTile
                  label="Total Questions"
                  count={safeQuestions}
                  accent="emerald"
                  tooltip="Total number of questions asked — click to view the list"
                  onClick={() => openList("questions")}
                />
                <StatTile
                  label="Total Feedbacks"
                  count={safeFeedbacks}
                  accent="amber"
                  tooltip="Total number of feedbacks received — click to view the list"
                  onClick={() => openList("feedbacks")}
                />
                <StatTile
                  label="Total Users"
                  count={safeUsers}
                  accent="blue"
                  tooltip="Total number of users — click to view the list"
                  onClick={() => openList("users")}
                />
              </div>

              {/* Feedback Rate footer */}
              <div className="mt-auto flex items-center justify-between gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-2">
                <div className="flex items-center gap-1.5">
                  <Percent className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    Feedback Rate (of Questions)
                  </span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-xs font-semibold tabular-nums text-foreground underline-offset-2 hover:underline">
                      {feedbackPct.toFixed(1)}%
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="w-64 p-3">
                    <div className="space-y-1 text-xs">
                      <div className="font-semibold">
                        Feedback Rate Breakdown
                      </div>
                      <div className="flex justify-between gap-4">
                        <span className="text-muted-foreground">
                          Feedbacks / Questions
                        </span>
                        <span className="tabular-nums text-foreground font-medium">
                          {safeFeedbacks.toLocaleString()}/
                          {safeQuestions.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </TooltipProvider>
        )}
      </div>

      <DatasetListModal<DatasetQuestionListItem>
        isOpen={activeList === "questions"}
        onClose={closeList}
        title="All Questions"
        description={`Total: ${(questionsListQuery.data?.total ?? safeQuestions).toLocaleString()}`}
        columns={questionColumns}
        rows={questionsListQuery.data?.data ?? []}
        isLoading={questionsListQuery.isLoading}
        page={listPage}
        totalPages={questionsListQuery.data?.totalPages ?? 1}
        totalCount={questionsListQuery.data?.total ?? safeQuestions}
        onPageChange={setListPage}
        getRowKey={(r) => r.questionId}
      />

      <DatasetListModal<DatasetFeedbackListItem>
        isOpen={activeList === "feedbacks"}
        onClose={closeList}
        title="All Feedbacks"
        description={`Total: ${(feedbacksListQuery.data?.total ?? safeFeedbacks).toLocaleString()}`}
        columns={feedbackColumns}
        rows={feedbacksListQuery.data?.data ?? []}
        isLoading={feedbacksListQuery.isLoading}
        page={listPage}
        totalPages={feedbacksListQuery.data?.totalPages ?? 1}
        totalCount={feedbacksListQuery.data?.total ?? safeFeedbacks}
        onPageChange={setListPage}
        getRowKey={(r, i) => `${r.email}-${r.questionId}-${i}`}
      />

      <DatasetListModal<DatasetUserListItem>
        isOpen={activeList === "users"}
        onClose={closeList}
        title="All Users"
        description={`Total: ${(usersListQuery.data?.total ?? safeUsers).toLocaleString()}`}
        columns={userColumns}
        rows={usersListQuery.data?.data ?? []}
        isLoading={usersListQuery.isLoading}
        page={listPage}
        totalPages={usersListQuery.data?.totalPages ?? 1}
        totalCount={usersListQuery.data?.total ?? safeUsers}
        onPageChange={setListPage}
        getRowKey={(r, i) => `${r.email}-${i}`}
      />
    </div>
  );
}

const ACCENT = {
  emerald: {
    dot: "bg-emerald-500",
    glow: "group-hover/tile:shadow-emerald-500/10",
    ring: "group-hover/tile:ring-emerald-500/30",
  },
  amber: {
    dot: "bg-amber-500",
    glow: "group-hover/tile:shadow-amber-500/10",
    ring: "group-hover/tile:ring-amber-500/30",
  },
  blue: {
    dot: "bg-blue-500",
    glow: "group-hover/tile:shadow-blue-500/10",
    ring: "group-hover/tile:ring-blue-500/30",
  },
} as const;

function StatTile({
  label,
  count,
  accent,
  tooltip,
  onClick,
}: {
  label: string;
  count: number;
  accent: keyof typeof ACCENT;
  tooltip: string;
  onClick?: () => void;
}) {
  const a = ACCENT[accent];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <motion.div
          whileHover={{ y: -2 }}
          transition={{ duration: 0.15 }}
          onClick={onClick}
          role={onClick ? "button" : undefined}
          tabIndex={onClick ? 0 : undefined}
          onKeyDown={
            onClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onClick();
                  }
                }
              : undefined
          }
          className={cn(
            "group/tile relative flex flex-col items-start gap-1.5 overflow-hidden rounded-xl p-3 text-left",
            "bg-background/40 ring-1 ring-border/50 transition-all duration-200",
            "hover:bg-background/80 hover:shadow-md",
            onClick && "cursor-pointer",
            a.ring,
            a.glow,
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", a.dot)} />
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </span>
          </div>
          <span className="text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">
            <CountUp end={count} duration={1.2} preserveValue />
          </span>
        </motion.div>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}
