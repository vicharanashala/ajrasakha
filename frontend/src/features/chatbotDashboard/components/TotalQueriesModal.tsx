import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
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
  labels?: string[];
  analytics?: {
    daily?: AnalyticsEntry[];
    weekly?: AnalyticsEntry[];
    monthly?: AnalyticsEntry[];
  };
  summaries?: {
    daily: QuerySummary;
    weekly: QuerySummary;
    monthly: QuerySummary;
  };
  renderChart: () => ReactNode;
};

const tabs: Array<{ label: string; value: QueryGranularity }> = [
  { label: "Monthly", value: "monthly" },
  { label: "Weekly", value: "weekly" },
  { label: "Daily", value: "daily" },
];

const columns: ReusableTableColumn<AnalyticsEntry>[] = [
  {
    key: "period",
    header: "Period",
    render: (entry) => entry.period,
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
    key: "averageCloseTimeMinutes",
    header: "Avg. Closing Time",
    align: "right",
    className: "font-medium text-gray-900 dark:text-gray-100",
    render: (entry) => `${entry.averageCloseTimeMinutes} min`,
  },
];

export function TotalQueriesModal({
  granularity,
  onGranularityChange,
  onClose,
  accentColor,
  valueColor,
  icon,
  label,
  value,
  labels,
  analytics,
  summaries,
  renderChart,
}: TotalQueriesModalProps) {
  const rows = (analytics?.[granularity] ?? []).map((entry, index) => ({
    ...entry,
    period: labels?.[index] ?? entry.period,
  }));

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

          <ReusableDataTable
            columns={columns}
            data={rows}
            getRowKey={(row, index) => `${row.period}-${index}`}
            emptyMessage="No query analytics available for this period."
            className="max-h-[38vh]"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
