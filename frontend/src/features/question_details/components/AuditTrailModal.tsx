import { useState, useEffect } from "react";
import { useGetAuditTrailsByQuestionId } from "@/hooks/api/auditTrails/useGetAuditTrailsByQuestionId";
import type { ModeratorAuditTrail } from "@/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/atoms/dialog";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Loader2, User, Clock, Activity, AlertCircle, CheckCircle, XCircle, Copy, Check, ChevronLeft, ChevronRight, Filter, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from "lucide-react";
import { formatDate } from "@/utils/formatDate";
import { Skeleton } from "@/components/atoms/skeleton";
import { toast } from "sonner";

interface AuditTrailModalProps {
  open: boolean;
  onClose: () => void;
  questionId: string;
}

const ITEMS_PER_PAGE = 10;

// Action labels mapping for better readability
const actionLabels: Record<string, string> = {
  QUESTION_ADD: "Question Added",
  QUESTION_UPDATE: "Question Updated",
  QUESTION_DELETE: "Question Deleted",
  QUESTION_BULK_CREATE: "Bulk Questions Created",
  QUESTION_BULK_UPDATE: "Bulk Questions Updated",
  QUESTION_BULK_DELETE: "Bulk Questions Deleted",
  REALLOCATE_QUESTIONS: "Questions Reallocated",
  QUESTION_HOLD: "Question Put on Hold",
  QUESTION_UNHOLD: "Question Released from Hold",
  QUESTION_PASS: "Question Passed",
  BULK_PAE_ALLOCATE: "Bulk PAE Allocation",
  REPLACE_QUEUE_EXPERT: "Queue Expert Replaced",
  CHECK_DUPLICATE: "Duplicate Check",
  APPROVE_AI_INITIAL_ANSWER: "Approve LLM Answer",
  EXPERTS_AUTO_ALLOCATE: "Expert Auto-allocated",
  SELECT_EXPERT: "Expert Selected",
  DELETE_EXPERT: "Expert Deleted",
  EXPERTS_ADD_COMMENT: "Comment Added by Expert",
  BLOCK_EXPERT: "Expert Blocked",
  UNBLOCK_EXPERT: "Expert Unblocked",
  ACTIVATE_EXPERT: "Expert Activated",
  DEACTIVATE_EXPERT: "Expert Deactivated",
  ASSIGN_STF: "STF Assigned",
  REMOVE_STF: "STF Removed",
  APPROVE_ANSWER: "Answer Approved",
  EDIT_FINAL_ANSWER: "Final Answer Edited",
  REROUTE_ANSWER: "Answer Rerouted",
  REROUTE_REJECTION: "Reroute Rejected",
  SUBMIT_ANSWER: "Answer Submitted",
  REVIEW_ANSWER: "Answer Created",
  DELETE_ANSWER: "Answer Deleted",
  MODERATOR_REJECT_REROUTE: "Reroute Rejected by Moderator",
  GENERATE_ANSWER: "AI Answer Generated",
  ADD_FARMER: "Farmer Added",
  UPDATE_FARMER: "Farmer Updated",
  DELETE_FARMER: "Farmer Deleted",
  CHANGE_STATUS: "Status Changed",
  DELETE_REQUEST: "Request Deleted",
  ADD_CROP: "Crop Added",
  UPDATE_CROP: "Crop Updated",
  CROP_BULK_CREATE: "Bulk Crops Created",
  SEND_OUTREACH_REPORT: "Outreach Report Sent",
  DOWNLOAD: "Report Downloaded",
  SEND_DASHBOARD_REPORT: "Dashboard Report Sent",
  ANALYTICS_EXPORT_PDF: "Analytics PDF Exported",
  TOGGLE_ROLE: "Role Changed",
  VERIFY_USER: "User Verification",
  UPDATE_USER_VERIFICATION: "User Verification Updated",
  CHANGE_USER_PASSWORD: "User Password Changed",
};

const actionOptions = Object.entries(actionLabels).map(([value, label]) => ({
  value,
  label,
})).sort((a, b) => a.label.localeCompare(b.label));

const getActionLabel = (action: string): string => {
  return actionLabels[action] || action.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
};

const getCategoryLabel = (category: string): string => {
  return category?.replace(/_/g, " ") || "";
};

const getOutcomeIcon = (status: string) => {
  switch (status) {
    case "SUCCESS":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "FAILED":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "PARTIAL":
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    default:
      return null;
  }
};

const getOutcomeBadgeClass = (status: string): string => {
  switch (status) {
    case "SUCCESS":
      return "bg-green-500/10 text-green-600 border-green-500/30";
    case "FAILED":
      return "bg-red-500/10 text-red-600 border-red-500/30";
    case "PARTIAL":
      return "bg-yellow-500/10 text-yellow-600 border-yellow-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
};

interface AuditItemProps {
  audit: ModeratorAuditTrail;
}

const AuditItem = ({ audit }: AuditItemProps) => {
  return (
    <div className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-sm text-foreground truncate">
            {getActionLabel(audit.action)}
          </h4>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <Badge variant="outline" className="text-xs">
              {getCategoryLabel(audit.category)}
            </Badge>
            {audit.outcome?.status && (
              <Badge variant="outline" className={`text-xs gap-1 ${getOutcomeBadgeClass(audit.outcome.status)}`}>
                {getOutcomeIcon(audit.outcome.status)}
                {audit.outcome.status}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
          <Clock className="h-3 w-3" />
          {audit.createdAt ? formatDate(new Date(audit.createdAt)) : "N/A"}
        </div>
      </div>

      {/* Actor Details */}
      {audit.actor && (
        <div className="flex items-center gap-2 mb-3 p-2 rounded-md bg-muted/30">
          <User className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {audit.actor.name || "Unknown Actor"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {audit.actor.email || "No email"} • {audit.actor.role || "No role"}
            </p>
          </div>
        </div>
      )}

      {/* Changes */}
      {(audit.changes?.before || audit.changes?.after) && (
        <div className="mb-3 space-y-2">
          {audit.changes.before && Object.keys(audit.changes.before).length > 0 && (
            <div className="p-2 rounded-md bg-red-500/5 border border-red-500/20">
              <p className="text-xs font-medium text-red-600 mb-1">Before:</p>
              <div className="space-y-1">
                {Object.entries(audit.changes.before).map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <span className="text-muted-foreground">{key}:</span>{" "}
                    <span className="text-foreground">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {audit.changes.after && Object.keys(audit.changes.after).length > 0 && (
            <div className="p-2 rounded-md bg-green-500/5 border border-green-500/20">
              <p className="text-xs font-medium text-green-600 mb-1">After:</p>
              <div className="space-y-1">
                {Object.entries(audit.changes.after).map(([key, value]) => (
                  <div key={key} className="text-xs">
                    <span className="text-muted-foreground">{key}:</span>{" "}
                    <span className="text-foreground">
                      {typeof value === "object" ? JSON.stringify(value) : String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Context */}
      {audit.context && Object.keys(audit.context).length > 0 && (
        <div className="mb-3 p-2 rounded-md bg-muted/20">
          <p className="text-xs font-medium text-muted-foreground mb-1">Context:</p>
          <div className="space-y-1">
            {Object.entries(audit.context).map(([key, value]) => (
              <div key={key} className="text-xs flex gap-1">
                <span className="text-muted-foreground">{key}:</span>
                <span className="text-foreground truncate">
                  {Array.isArray(value) 
                    ? value.map(v => String(v)).join(", ")
                    : typeof value === "object" 
                      ? JSON.stringify(value) 
                      : String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Details */}
      {audit.outcome?.errorMessage && (
        <div className="p-2 rounded-md bg-red-500/5 border border-red-500/20">
          <p className="text-xs font-medium text-red-600 mb-1">Error:</p>
          <p className="text-xs text-foreground">{audit.outcome.errorMessage}</p>
        </div>
      )}
    </div>
  );
};

export const AuditTrailModal = ({ open, onClose, questionId }: AuditTrailModalProps) => {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, error, refetch } = useGetAuditTrailsByQuestionId(
    questionId,
    open,
    page,
    ITEMS_PER_PAGE,
    action || null,
    order
  );

  // Debug log
  console.log("AuditTrailModal - action:", action, "page:", page, "totalDocs:", data?.totalDocuments);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [action, order]);

  // Reset filters when modal opens
  useEffect(() => {
    if (open) {
      setPage(1);
      setAction("");
      setOrder("desc");
    }
  }, [open]);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(questionId);
      setCopied(true);
      toast.success("Question ID copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const handleActionChange = (newAction: string) => {
    setAction(newAction);
    setPage(1);
  };

  const toggleSortOrder = () => {
    setOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    setPage(1);
  };

  const handleRefetch = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
      toast.success("Audit trails refreshed");
    } catch {
      toast.error("Failed to refresh");
    } finally {
      setIsRefreshing(false);
    }
  };

  const totalPages = data?.totalPages || 1;
  const totalDocuments = data?.totalDocuments || 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="!max-w-[80vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Audit Trail
          </DialogTitle>
        </DialogHeader>

        {/* Filter Section */}
        <div className="shrink-0 flex items-center gap-3 pb-3 border-b flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <select
            value={action}
            onChange={(e) => handleActionChange(e.target.value)}
            className="text-sm border rounded-md px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-primary min-w-[200px]"
          >
            <option value="">All Actions</option>
            {actionOptions.map((opt: { value: string; label: string }) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            variant="outline"
            onClick={handleRefetch}
            disabled={isLoading || isRefreshing}
            className="gap-1.5"
          >
            {isRefreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">QID:</span>
              <code className="px-2 py-1 rounded bg-muted text-foreground font-mono text-xs max-w-[120px] truncate">
                {questionId}
              </code>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={handleCopyId}
                title="Copy Question ID"
              >
                {copied ? (
                  <Check className="h-3 w-3 text-green-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
            {totalDocuments > 0 && (
              <span className="text-xs text-muted-foreground">
                ({totalDocuments} {totalDocuments === 1 ? "entry" : "entries"})
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-1">
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="border rounded-lg p-4 bg-card">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1">
                      <Skeleton className="h-4 w-32 mb-2" />
                      <div className="flex gap-2">
                        <Skeleton className="h-5 w-16" />
                        <Skeleton className="h-5 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-10 w-full mb-3" />
                  <div className="flex gap-2">
                    <Skeleton className="h-4 w-full" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center py-12 text-destructive">
              <AlertCircle className="h-5 w-5 mr-2" />
              <span>Failed to load audit trails</span>
            </div>
          )}

          {!isLoading && !error && data?.data && data.data.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mb-3 opacity-50" />
              <p className="text-sm">No audit trails found for this question</p>
            </div>
          )}

          {!isLoading && !error && data?.data && data.data.length > 0 && (
            <div className="space-y-3">
              {data.data.map((audit, index) => (
                <AuditItem key={`${audit.actor?.id || 'unknown'}-${index}`} audit={audit} />
              ))}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="shrink-0 flex items-center justify-between pt-4 border-t mt-4">
            <div className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || isLoading}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};