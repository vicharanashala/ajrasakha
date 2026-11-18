import React, { useEffect, useState, useCallback } from "react";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "./atoms/popover";
import { Button } from "./atoms/button";
import {
  Bell,
  CheckCircle2,
  Clock,
  Phone,
  RefreshCw,
  ExternalLink,
  Check,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { anaraService, type AiDraftFollowUpItem } from "@/hooks/services/anaraService";
import { usePlivo } from "@/context/PlivoContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

export const ReviewNotificationsBell: React.FC = () => {
  const [items, setItems] = useState<AiDraftFollowUpItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"pending_callback" | "in_review" | "all">("pending_callback");
  const { initiateRedial } = usePlivo();

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await anaraService.getFollowUps();
      // Strictly ignore any testing queries (callUuid starting with testing_)
      const cleanQueries = (res?.queries || []).filter(
        (q) => q.callUuid && !q.callUuid.startsWith("testing_")
      );
      setItems(cleanQueries);
    } catch (err: any) {
      console.warn("[ReviewNotificationsBell] Error fetching follow-ups:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const timer = setInterval(fetchNotifications, 60000); // Poll every 1 minute
    return () => clearInterval(timer);
  }, [fetchNotifications]);

  // Exclude any testing queries from all notification lists
  const validItems = items.filter(
    (i) => i.callUuid && !i.callUuid.startsWith("testing_")
  );

  // Approved items waiting for Call Agent to call farmer back
  const pendingCallbacks = validItems.filter(
    (i) => i.reviewStatus === "approved" && i.farmerFollowUpStatus !== "resolved"
  );

  // Items currently under 2h review in Review System
  const inReviewItems = validItems.filter((i) => i.reviewStatus === "pending_review");

  const unreadCount = pendingCallbacks.length;

  const handleCallFarmer = async (item: AiDraftFollowUpItem) => {
    const phone = item.from || item.metadata?.farmerPhone;
    if (!phone) {
      toast.error("Farmer phone number is not available for this query.");
      return;
    }

    try {
      toast.info(`Initiating outbound callback to farmer: ${phone}...`);
      const success = await initiateRedial(phone, {
        source: "anara_review_followup",
        queryId: item._id,
      });

      if (success) {
        // Mark as called
        if (item._id) {
          await anaraService.updateFollowUpStatus(item._id, "called");
          setItems((prev) =>
            prev.map((q) =>
              q._id === item._id ? { ...q, farmerFollowUpStatus: "called" } : q
            )
          );
        }
      }
    } catch (err: any) {
      console.error("[ReviewNotificationsBell] Error initiating call:", err);
      toast.error(err?.message || "Failed to initiate outbound call");
    }
  };

  const handleMarkResolved = async (item: AiDraftFollowUpItem) => {
    if (!item._id) return;
    try {
      await anaraService.updateFollowUpStatus(item._id, "resolved");
      setItems((prev) =>
        prev.map((q) =>
          q._id === item._id ? { ...q, farmerFollowUpStatus: "resolved" } : q
        )
      );
      toast.success("Marked follow-up as resolved.");
    } catch (err: any) {
      toast.error(err?.message || "Failed to update status");
    }
  };

  const handleViewDetails = (item: AiDraftFollowUpItem) => {
    setIsOpen(false);
    // Dispatch global event for dashboard to switch to call_history tab and select this call
    window.dispatchEvent(
      new CustomEvent("acc:view-call-query", {
        detail: {
          callUuid: item.callUuid,
          queryId: item._id,
        },
      })
    );
  };

  const displayedList =
    activeTab === "pending_callback"
      ? pendingCallbacks
      : activeTab === "in_review"
      ? inReviewItems
      : validItems;

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) fetchNotifications();
          }}
          className="relative p-2 rounded-xl text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer select-none"
          title="Review System Notifications & Farmer Callbacks"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-emerald-600 text-[10px] font-bold text-white shadow-xs animate-bounce">
              {unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-96 max-w-[95vw] p-0 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden flex flex-col max-h-[520px]"
      >
        {/* Header */}
        <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/70 dark:bg-zinc-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                Review & Follow-ups
              </h4>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Moderator verification & farmer callbacks
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={fetchNotifications}
            disabled={loading}
            className="h-7 w-7 p-0 cursor-pointer text-zinc-500 hover:text-zinc-900"
            title="Refresh notifications"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Tab Filters */}
        <div className="grid grid-cols-3 border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-900/40 p-1 gap-1 text-xs">
          <button
            type="button"
            onClick={() => setActiveTab("pending_callback")}
            className={`py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === "pending_callback"
                ? "bg-white dark:bg-zinc-800 text-emerald-700 dark:text-emerald-400 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <span>Ready to Call</span>
            {pendingCallbacks.length > 0 && (
              <span className="h-4 min-w-[16px] px-1 rounded-full bg-emerald-600 text-[9px] font-bold text-white flex items-center justify-center">
                {pendingCallbacks.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("in_review")}
            className={`py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
              activeTab === "in_review"
                ? "bg-white dark:bg-zinc-800 text-amber-700 dark:text-amber-400 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <span>In Review</span>
            {inReviewItems.length > 0 && (
              <span className="h-4 min-w-[16px] px-1 rounded-full bg-amber-500 text-[9px] font-bold text-white flex items-center justify-center">
                {inReviewItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("all")}
            className={`py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer flex items-center justify-center ${
              activeTab === "all"
                ? "bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-2xs"
                : "text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <span>All ({items.length})</span>
          </button>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {displayedList.length === 0 ? (
            <div className="py-10 text-center px-4">
              <CheckCircle2 className="h-8 w-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-2" />
              <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {activeTab === "pending_callback"
                  ? "No callbacks pending!"
                  : activeTab === "in_review"
                  ? "No questions currently under review."
                  : "No review questions found."}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {activeTab === "pending_callback"
                  ? "When a Moderator approves an AI-drafted question, it will appear here."
                  : "Submit an AI draft from the Call Interface to track its 2h SLA."}
              </p>
            </div>
          ) : (
            displayedList.map((item) => {
              const farmerPhone = item.from || item.metadata?.farmerPhone || "Unknown";
              const farmerName = item.metadata?.farmerName || "Farmer";
              const crop = item.metadata?.extracted_crop;
              const state = item.metadata?.extracted_state;

              return (
                <div
                  key={item._id || item.callUuid}
                  className="p-3 hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40 transition-colors flex flex-col gap-2"
                >
                  {/* Status & Timing */}
                  <div className="flex items-center justify-between text-[11px]">
                    {item.reviewStatus === "approved" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3 w-3" />
                        <span>Approved by Moderator</span>
                      </span>
                    ) : item.reviewStatus === "pending_review" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
                        <Clock className="h-3 w-3 animate-pulse" />
                        <span>Under Review (2h SLA)</span>
                      </span>
                    ) : item.reviewStatus === "submission_failed" ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-rose-600 dark:text-rose-400">
                        <AlertCircle className="h-3 w-3" />
                        <span>Submission Failed</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">Drafted</span>
                    )}

                    {item.createdAt && (
                      <span className="text-[10px] text-zinc-400">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>

                  {/* Question snippet */}
                  <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2 leading-snug">
                    {item.question}
                  </p>

                  {/* Farmer & Crop metadata */}
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {farmerName} ({farmerPhone})
                    </span>
                    {(crop || state) && (
                      <>
                        <span>•</span>
                        <span className="text-zinc-500">
                          {[crop, state].filter(Boolean).join(", ")}
                        </span>
                      </>
                    )}
                  </div>

                  {/* Verified Answer Snippet if approved */}
                  {item.reviewStatus === "approved" && (item.reviewedAnswer || item.answer) && (
                    <div className="bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-900/40 rounded-lg p-2 text-[11px] text-emerald-950 dark:text-emerald-200 line-clamp-2">
                      <span className="font-semibold text-emerald-800 dark:text-emerald-300 mr-1">
                        Verified:
                      </span>
                      {item.reviewedAnswer || item.answer}
                    </div>
                  )}

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-1 mt-1 border-t border-zinc-100 dark:border-zinc-800">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleViewDetails(item)}
                      className="h-6 px-2 text-[11px] text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 flex items-center gap-1 cursor-pointer p-0"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>View Details</span>
                    </Button>

                    <div className="flex items-center gap-1.5">
                      {item.reviewStatus === "approved" && item.farmerFollowUpStatus !== "resolved" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkResolved(item)}
                            className="h-6 px-2 text-[11px] text-zinc-600 dark:text-zinc-400 cursor-pointer"
                            title="Mark follow-up completed"
                          >
                            <Check className="h-3 w-3 mr-0.5" />
                            <span>Resolved</span>
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => handleCallFarmer(item)}
                            className="h-6 px-2.5 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-semibold flex items-center gap-1 cursor-pointer rounded-md shadow-2xs"
                            title={`Call farmer ${farmerPhone} via Plivo`}
                          >
                            <Phone className="h-3 w-3" />
                            <span>Call Farmer</span>
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
