import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/hooks/api/api-fetch";
import { env } from "@/config/env";
import type { AnalyticsEntry } from "../utils/dashboardHelpers";
import {
  ReusableDataTable,
  type ReusableTableColumn,
} from "./ReusableDataTable";
import { motion, AnimatePresence } from "framer-motion";

export type QueryGranularity = "weekly" | "daily" | "monthly";

type QuerySummary = {
  label: string;
  totalQueries: number;
};

type TotalQueriesModalProps = {
  granularity: QueryGranularity;
  onGranularityChange: (granularity: QueryGranularity) => void;
  onClose: () => void;
  accentColor: string;
  valueColor?: string;
  icon?: ReactNode;
  label: string;
  value: string;
  analytics?: {
    daily?: AnalyticsEntry[];
    weekly?: AnalyticsEntry[];
    monthly?: AnalyticsEntry[];
  };
  source?: "vicharanashala" | "annam" | "whatsapp";
  userType?: "all" | "external" | "internal";
  summaries?: {
    daily: QuerySummary;
    weekly: QuerySummary;
    monthly: QuerySummary;
  };
  renderChart: () => ReactNode;
};

type QueryAnalyticsResponse = {
  data: AnalyticsEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const tabs: Array<{ label: string; value: QueryGranularity }> = [
  { label: "Monthly", value: "monthly" },
  { label: "Weekly", value: "weekly" },
  { label: "Daily", value: "daily" },
];

const fallbackFilterDate = new Date();

function formatDateRangeDate(date: Date) {
  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
}

function formatDailyPeriod(period: string) {
  const date = new Date(`${period}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return period;
  }

  return date.toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthlyPeriod(period: string) {
  const date = new Date(`${period}-01T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return period;
  }

  return date.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

function getWeekRange(period: string) {
  const match = period.match(/^(\d{4})-W(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const week = Number(match[2]);
  const janFourth = new Date(year, 0, 4);
  const janFourthDay = janFourth.getDay() || 7;
  const weekOneMonday = new Date(janFourth);
  weekOneMonday.setDate(janFourth.getDate() - janFourthDay + 1);

  const weekStart = new Date(weekOneMonday);
  weekStart.setDate(weekOneMonday.getDate() + (week - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return { week, weekStart, weekEnd };
}

function formatWeeklyPeriod(period: string) {
  const range = getWeekRange(period);

  if (!range) {
    return period;
  }

  return `W${range.week} (${formatDateRangeDate(
    range.weekStart,
  )} - ${formatDateRangeDate(range.weekEnd)})`;
}

function formatPeriod(period: string, granularity: QueryGranularity) {
  if (granularity === "daily") {
    return formatDailyPeriod(period);
  }

  if (granularity === "monthly") {
    return formatMonthlyPeriod(period);
  }

  return formatWeeklyPeriod(period);
}

function parsePeriodDate(period: string, granularity: QueryGranularity) {
  if (granularity === "weekly") {
    return getWeekRange(period)?.weekStart ?? null;
  }

  const date =
    granularity === "monthly"
      ? new Date(`${period}-01T00:00:00`)
      : new Date(`${period}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function getLatestFilterDate(
  rows: AnalyticsEntry[],
  granularity: QueryGranularity,
) {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const parsed = parsePeriodDate(rows[index].period, granularity);

    if (parsed) {
      return parsed;
    }
  }

  return fallbackFilterDate;
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addYears(date: Date, amount: number) {
  return new Date(date.getFullYear() + amount, 0, 1);
}

function formatFilterLabel(date: Date, granularity: QueryGranularity) {
  if (granularity === "monthly") {
    return date.getFullYear().toString();
  }

  return date.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });
}

function formatMonthParam(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}`;
}

function getColumns(
  granularity: QueryGranularity,
): ReusableTableColumn<AnalyticsEntry>[] {
  return [
    {
      key: "period",
      header: "Period",
      render: (entry) => formatPeriod(entry.period, granularity),
    },
    {
      key: "queryCount",
      header: "Total Queries",
      align: "right",
      className: "font-medium text-gray-900 dark:text-gray-100",
      render: (entry) => entry.queryCount.toLocaleString(),
    },
    {
      key: "totalQuestions",
      header: "Total Questions",
      align: "right",
      className: "font-medium text-gray-900 dark:text-gray-100",
      render: (entry) => entry.totalQuestions.toLocaleString(),
    },
    {
      key: "closedQuestions",
      header: "Closed Questions",
      align: "right",
      className: "font-medium text-gray-900 dark:text-gray-100",
      render: (entry) => entry.closedQuestions.toLocaleString(),
    },
    // {
    //   key: "averageCloseTime",
    //   header: "Avg. Closing Time",
    //   align: "right",
    //   className: "font-medium text-gray-900 dark:text-gray-100",
    //   render: (entry) => entry.averageCloseTime || "0 minutes",
    // },
    {
      key: "passedQuestions",
      header: "Passed Questions",
      align: "right",
      className: "font-medium text-gray-900 dark:text-gray-100",
      render: (entry) => entry.passedQuestions || "0",
    },
  ];
}

export function TotalQueriesModal({
  granularity,
  onGranularityChange,
  onClose,
  accentColor,
  valueColor,
  icon,
  label,
  value,
  analytics,
  source = "vicharanashala",
  userType = "all",
  summaries,
  renderChart,
}: TotalQueriesModalProps) {
  const pageSize = 10;
  const rows = useMemo(
    () => analytics?.[granularity] ?? [],
    [analytics, granularity],
  );
  const [selectedDate, setSelectedDate] = useState(() =>
    getLatestFilterDate(rows, granularity),
  );
  const [page, setPage] = useState(1);
  const columns = useMemo(() => getColumns(granularity), [granularity]);
  const filterParam =
    granularity === "monthly"
      ? { year: selectedDate.getFullYear().toString() }
      : { month: formatMonthParam(selectedDate) };

  const { data: queryAnalytics, isFetching } = useQuery<
    QueryAnalyticsResponse,
    Error
  >({
    queryKey: [
      "total-query-analytics",
      granularity,
      filterParam,
      page,
      pageSize,
      source,
      userType,
    ],
    placeholderData: (previous) => previous,
    queryFn: async () => {
      const params = new URLSearchParams({
        period: granularity,
        page: page.toString(),
        limit: pageSize.toString(),
      });

      if (filterParam.month) {
        params.set("month", filterParam.month);
      }

      if (filterParam.year) {
        params.set("year", filterParam.year);
      }

      params.set("source", source === "whatsapp" ? "annam" : source);
      if (userType !== "all") {
        params.set("userType", userType);
      }

      const response = await apiFetch<QueryAnalyticsResponse>(
        `${env.apiBaseUrl()}/analytics/query-analytics?${params.toString()}`,
      );

      return (
        response ?? {
          data: [],
          page,
          limit: pageSize,
          total: 0,
          totalPages: 1,
        }
      );
    },
  });

  useEffect(() => {
    setSelectedDate(getLatestFilterDate(rows, granularity));
  }, [granularity, rows]);

  useEffect(() => {
    setPage(1);
  }, [granularity, selectedDate]);

  const stepFilter = (direction: -1 | 1) => {
    setSelectedDate((current) =>
      granularity === "monthly"
        ? addYears(current, direction)
        : addMonths(current, direction),
    );
  };

  const activeSummary = summaries?.[granularity];
  const headerLabel = activeSummary?.label ?? label;
  const headerValue = activeSummary?.totalQueries?.toLocaleString() ?? value;


  return createPortal(
    <AnimatePresence>
      <motion.div
        key="modal-overlay"
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          className="relative w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl bg-white dark:bg-[#111] shadow-[0_20px_70px_-15px_rgba(0,0,0,0.45)] ring-1 ring-black/5 dark:ring-white/10 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
        >
          {/* Accent gradient bar */}
          <div
            className="h-1 w-full shrink-0"
            style={{
              background: `linear-gradient(90deg, ${accentColor}, transparent)`,
            }}
          />

          {/* Header */}
          <motion.div
            className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-white/5 shrink-0"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div className="flex items-center gap-3 min-w-0">
              {icon && (
                <motion.div
                  className="flex items-center justify-center w-12 h-12 rounded-2xl flex-shrink-0 ring-1 ring-black/5 dark:ring-white/10"
                  style={{ background: `${accentColor}1A` }}
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 20,
                    delay: 0.12,
                  }}
                >
                  {icon}
                </motion.div>
              )}
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400">
                  {headerLabel}
                </div>
                <div
                  className="text-4xl font-semibold tracking-tight dark:text-slate-100 tabular-nums"
                  style={{ color: valueColor }}
                >
                  {headerValue}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="relative flex items-center gap-1 rounded-full bg-gray-100 dark:bg-white/5 p-1 flex-shrink-0">
                {tabs.map((tab) => {
                  const active = granularity === tab.value;
                  return (
                    <button
                      key={tab.value}
                      onClick={() => onGranularityChange(tab.value)}
                      className={`relative text-sm px-4 py-1.5 rounded-full font-medium transition-colors ${
                        active
                          ? "text-gray-900 dark:text-white"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="granularity-pill"
                          className="absolute inset-0 bg-white dark:bg-white/10 rounded-full shadow-sm"
                          transition={{
                            type: "spring",
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}
                      <span className="relative z-10">{tab.label}</span>
                    </button>
                  );
                })}
              </div>
              <motion.button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                aria-label="Close"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.92 }}
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </motion.button>
            </div>
          </motion.div>

          {/* Body */}
          <div className="flex-1 overflow-auto px-6 py-5">
            {/* Chart */}
            <motion.div
              className="h-52 relative mb-5 rounded-xl bg-gray-50/60 dark:bg-white/5 p-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <div className="absolute left-4 top-4 bottom-4 w-px bg-gray-200 dark:bg-white/10" />
              <div className="absolute left-4 right-4 bottom-4 h-px bg-gray-200 dark:bg-white/10" />
              <AnimatePresence mode="wait">
                <motion.div
                  key={granularity}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="h-full w-full"
                >
                  {renderChart()}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Toolbar */}
            <motion.div
              className="flex items-center justify-between gap-3 mb-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {granularity === "monthly"
                  ? "Monthly data"
                  : `${
                      tabs.find((tab) => tab.value === granularity)?.label
                    } data`}
              </div>
              <div className="flex items-center gap-1 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 px-1.5 py-1">
                <motion.button
                  onClick={() => stepFilter(-1)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="Previous period"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </motion.button>
                <AnimatePresence mode="wait">
                  <motion.span
                    key={String(selectedDate)}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.15 }}
                    className="min-w-[120px] text-center text-sm font-semibold text-gray-800 dark:text-gray-100 tabular-nums"
                  >
                    {formatFilterLabel(selectedDate, granularity)}
                  </motion.span>
                </AnimatePresence>
                <motion.button
                  onClick={() => stepFilter(1)}
                  className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="Next period"
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                >
                  <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                </motion.button>
              </div>
            </motion.div>

            {/* Notice */}
            {/* <motion.div
              className="mb-3 rounded-xl border border-amber-200/70 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              Queries can be classified by source (Annam / Vicharanashala), but
              questions cannot always be accurately classified by source because
              the review system database is shared across platforms.
            </motion.div> */}

            {/* Table */}
            <AnimatePresence mode="wait">
              <motion.div
                key={`${granularity}-${page}-${String(selectedDate)}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <ReusableDataTable
                  columns={columns}
                  data={queryAnalytics?.data ?? []}
                  getRowKey={(row, index) => `${row.period}-${index}`}
                  emptyMessage={
                    isFetching
                      ? "Loading query analytics..."
                      : "No query analytics available for this period."
                  }
                  className="max-h-[38vh]"
                />
              </motion.div>
            </AnimatePresence>

            {/* Pagination */}
            <div className="mt-4 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
              <span className="tabular-nums">
                {queryAnalytics?.total
                  ? `${queryAnalytics.total.toLocaleString()} result${
                      queryAnalytics.total === 1 ? "" : "s"
                    }`
                  : isFetching
                    ? "Loading..."
                    : "0 results"}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1 || isFetching}
                  className="px-2.5 py-1 rounded-md border border-gray-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Previous
                </button>
                <span className="min-w-[90px] text-center tabular-nums">
                  Page {queryAnalytics?.page ?? page} of{" "}
                  {queryAnalytics?.totalPages ?? 1}
                </span>
                <button
                  onClick={() =>
                    setPage((current) =>
                      Math.min(
                        queryAnalytics?.totalPages ?? current + 1,
                        current + 1,
                      ),
                    )
                  }
                  disabled={
                    isFetching || page >= (queryAnalytics?.totalPages ?? 1)
                  }
                  className="px-2.5 py-1 rounded-md border border-gray-200 dark:border-white/10 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-white/5 transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
