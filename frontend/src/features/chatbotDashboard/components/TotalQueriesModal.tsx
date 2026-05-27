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
    {
      key: "averageCloseTime",
      header: "Avg. Closing Time",
      align: "right",
      className: "font-medium text-gray-900 dark:text-gray-100",
      render: (entry) => entry.averageCloseTime || "0 minutes",
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
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl max-w-5xl w-full max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-gray-100 dark:border-[#2a2a2a] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div
                className="flex items-center justify-center w-12 h-12 rounded-full flex-shrink-0"
                style={{ background: `${accentColor}20` }}
              >
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {headerLabel}
              </div>
              <div
                className="text-4xl font-semibold dark:text-slate-100"
                style={{ color: valueColor }}
              >
                {headerValue}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full bg-gray-100 dark:bg-[#2a2a2a] p-1 flex-shrink-0">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => onGranularityChange(tab.value)}
                  className={`text-sm px-4 py-1.5 rounded-full font-medium transition-all ${
                    granularity === tab.value
                      ? "bg-white dark:bg-[#3a3a3a] text-gray-800 dark:text-gray-100 shadow-sm"
                      : "text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Close"
            >
              <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="h-48 relative mb-5">
            <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300 dark:bg-gray-700" />
            <div className="absolute left-0 right-0 bottom-0 h-px bg-gray-300 dark:bg-gray-700" />
            {renderChart()}
          </div>

          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              
              <div className="text-sm font-medium text-gray-800 dark:text-gray-100">
                {granularity === "monthly"
                  ? "Monthly data"
                  : `${
                      tabs.find((tab) => tab.value === granularity)?.label
                    } data`}
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111] px-2 py-1">
              <button
                onClick={() => stepFilter(-1)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Previous period"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
              <span className="min-w-[120px] text-center text-sm font-semibold text-gray-800 dark:text-gray-100">
                {formatFilterLabel(selectedDate, granularity)}
              </span>
              <button
                onClick={() => stepFilter(1)}
                className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Next period"
              >
                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400" />
              </button>
            </div>
          </div>
          <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200">
            Queries can be classified by source (Annam / Vicharanashala), but questions cannot always be accurately classified by source because the review system database is shared across platforms.
          </div>
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

          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-gray-400">
            <span>
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
                className="px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <span className="min-w-[80px] text-center">
                Page {queryAnalytics?.page ?? page} of{" "}
                {queryAnalytics?.totalPages ?? 1}
              </span>
              <button
                onClick={() =>
                  setPage((current) =>
                    Math.min(queryAnalytics?.totalPages ?? current + 1, current + 1),
                  )
                }
                disabled={
                  isFetching || page >= (queryAnalytics?.totalPages ?? 1)
                }
                className="px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
