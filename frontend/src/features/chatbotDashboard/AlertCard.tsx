import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Badge } from "./components/shared/Badge";
import { DomainSpikesModal } from "./components/DomainSpikesModal";
import { useDomainSpikes } from "./hooks/useDomainSpikes";

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
  duplicateQuestionsCount?: number | null;
  onDuplicateClick?: () => void;
  lowFeedbackUsersCount?: number | null;
  onLowFeedbackClick?: () => void;
  source: "vicharanashala" | "annam" | "whatsapp";
}

export function AlertCard({
  alerts: _alerts = [],
  inactiveUsersLast3Days = 0,
  onInactiveClick,
  duplicateQuestionsCount,
  onDuplicateClick,
  lowFeedbackUsersCount,
  onLowFeedbackClick,
  source,
}: AlertCardProps) {
  const [isSpikesModalOpen, setIsSpikesModalOpen] = useState(false);

  // Fetch spikes independently — always enabled so the preview row is live
  const { data: spikes = [] } = useDomainSpikes(true, 60);

  // Show the highest spike as the preview
  const topSpike = spikes.length > 0
    ? spikes.reduce((a, b) => (b.spikePct > a.spikePct ? b : a))
    : null;

  return (
    <div className="h-full flex flex-col bg-card text-card-foreground rounded-xl border shadow-sm dark:bg-[#1a1a1a] dark:border-[#2a2a2a] p-4">
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
      {source !== "whatsapp" &&
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
        <Badge label={inactiveUsersLast3Days.toLocaleString()} variant="red" />
      </div>
      }

      {/* Duplicate Questions Row */}
      <div
        className="flex items-center justify-between rounded-lg p-3 mb-2.5 border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
        onClick={() => onDuplicateClick?.()}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/40">
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
              className="text-amber-600 dark:text-amber-400"
            >
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <line x1="9" y1="12" x2="15" y2="12" />
              <line x1="9" y1="16" x2="15" y2="16" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-900 dark:text-gray-50">
              Duplicate Questions
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              Questions with high similarity score
            </div>
          </div>
        </div>
        <Badge label={duplicateQuestionsCount != null ? duplicateQuestionsCount.toLocaleString() : '—'} variant="amber" />
      </div>

      {/* Low Feedback Users Row */}
      {source !== "whatsapp" &&
      <div
        className="flex items-center justify-between rounded-lg p-3 mb-2.5 border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-950/30 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-950/50 transition-colors"
        onClick={() => onLowFeedbackClick?.()}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-100 dark:bg-orange-900/40">
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
              className="text-orange-600 dark:text-orange-400"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <div className="text-xs font-medium text-gray-900 dark:text-gray-50">
              Low Feedback Users
            </div>
            <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
              Users who have never given feedback
            </div>
          </div>
        </div>
        <Badge label={lowFeedbackUsersCount != null ? lowFeedbackUsersCount.toLocaleString() : '—'} variant="amber" />
      </div>
      }

      {/* Domain Spikes Row — always rendered, shows top spike or a placeholder */}
      {source !== "whatsapp" &&
      <div
        className="flex items-center justify-between rounded-lg p-3 mb-2.5 border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-950/30 cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors"
        onClick={() => setIsSpikesModalOpen(true)}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-red-100 dark:bg-red-900/40 shrink-0">
            <TrendingUp className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
          </div>
          <div className="min-w-0">
            {topSpike ? (
              <>
                <div className="text-xs font-medium text-red-700 dark:text-red-400 truncate">
                  Spike in {topSpike.domain}
                </div>
                {topSpike.location && (
                  <div className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                    {topSpike.location}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs font-medium text-red-700 dark:text-red-400">
                Domain Query Spikes
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {topSpike && (
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
              +{topSpike.spikePct}%
            </span>
          )}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-400"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </div>
      }
      
      <div className="flex-1" />

      {isSpikesModalOpen && (
        <DomainSpikesModal onClose={() => setIsSpikesModalOpen(false)} />
      )}
    </div>
  );
}
