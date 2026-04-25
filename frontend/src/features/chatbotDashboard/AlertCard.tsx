import { Badge } from "./components/shared/Badge";

interface Alert {
  id: number;
  level: "critical" | "warn" | "info";
  title: string;
  desc: string;
}

interface AlertCardProps {
  alerts?: Alert[];
  inactiveUsersLast3Days?: number;
  onInactiveClick?: () => void;
}

export function AlertCard({ alerts: _alerts = [], inactiveUsersLast3Days = 0, onInactiveClick }: AlertCardProps) {
  return (
    <div className="h-full flex flex-col bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3.5">
        <div className="min-w-0 flex-1 mr-2">
          <div className="text-[13px] font-medium text-[var(--card-foreground)]">
            Alerts &amp; Notifications
          </div>
          <div className="text-[11px] text-[var(--muted-foreground)] mt-0.5">
            Key metrics that need attention
          </div>
        </div>
      </div>

      {/* Inactive Users Row */}
      <div
        className="flex items-center justify-between rounded-lg p-3 mb-2.5 border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
        onClick={() => onInactiveClick?.()}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-red-600 dark:text-red-400"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="23" y1="11" x2="17" y2="11" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-900 dark:text-gray-50">
              Inactive Users (last 3 days)
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              Users with zero messages
            </div>
          </div>
        </div>
        <Badge
          label={inactiveUsersLast3Days.toLocaleString()}
          variant="red"
        />
      </div>

      {/* Future alert items can go here */}
      <div className="flex-1" />
    </div>
  );
}
