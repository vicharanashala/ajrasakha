import React, { useState } from "react";
import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
} from "@/types";
import { Textarea } from "@/components/atoms/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/atoms/accordion";
import { Separator } from "@/components/atoms/separator";
import { CommentsSection } from "@/components/comments-section";
import { useReRouteRejectQuestion } from "@/hooks/api/question/useReRouteRejectQuestion";
import { Card } from "@/components/atoms/card";
import { formatDate } from "@/utils/formatDate";
import { Badge } from "@/components/atoms/badge";
import { ExpandableText } from "@/components/expandable-text";
import { Button } from "@/components/atoms/button";
import {
  CheckCircle,
  Loader2,
  Clock,
  XCircle,
  User,
  Pencil,
  Check,
  Copy,
  Target,
  CheckCheck,
  X,
  Link2,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { renderModificationDiff } from "@/features/question_details/components/renderModificationDiff";
import { Label } from "@/components/atoms/label";
import { AcceptReviewDialog } from "@/features/qa-interface-page/AcceptReviewDialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";

const sourceTypeOrder: Record<string, number> = {
  hyper_local: 0,
  state: 1,
  central: 2,
  other: 3,
};

const sortSources = (sources: SourceItem[]) =>
  [...sources].sort((a, b) => {
    const orderA = sourceTypeOrder[a.sourceType || ""] ?? 99;
    const orderB = sourceTypeOrder[b.sourceType || ""] ?? 99;
    return orderA - orderB;
  });

const getSourceBadgeLabel = (source: SourceItem) => {
  const label =
    source.sourceType === "hyper_local"
      ? "Hyper Local"
      : source.sourceType === "state"
      ? "State"
      : source.sourceType === "central"
      ? "Central"
      : "Other";
  if (
    source.sourceName &&
    source.sourceName.toLowerCase() !== label.toLowerCase()
  ) {
    return `${label}: ${source.sourceName}`;
  }
  return label;
};

export const parameterLabels: Record<keyof IReviewParmeters, string> = {
  contextRelevance: "Context Relevance",
  technicalAccuracy: "Technical Accuracy",
  practicalUtility: "Practical Utility",
  valueInsight: "Value Insight",
  credibilityTrust: "Credibility & Trust",
  readabilityCommunication: "Readability",
};

interface RevampReviewHistoryTimelineProps {
  history: HistoryItem[];
  isSubmittingAnswer: boolean;
  rejectionReason: string;
  isRejectionSubmitted: boolean;
  checklist: any;
  setChecklist: (checklist: any) => void;
  setIsRejectDialogOpen: (open: boolean) => void;
  setIsModifyDialogOpen: (open: boolean) => void;
  handleAccept: () => void;
  questionId: string;
  selectedQuestionData?: IQuestion;
  setSelectedQuestion: (value: string | null) => void;
  refetchQuestions?: () => void;
}

export const RevampReviewHistoryTimeline: React.FC<RevampReviewHistoryTimelineProps> = ({
  history,
  isSubmittingAnswer,
  rejectionReason,
  isRejectionSubmitted,
  checklist,
  setChecklist,
  setIsRejectDialogOpen,
  setIsModifyDialogOpen,
  handleAccept,
  questionId,
  selectedQuestionData,
  setSelectedQuestion,
  refetchQuestions,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [rejectReRouteReason, setRejectReRouteReason] = useState("");
  const [rerouteModal, setRerouteModal] = useState(false);
  const [expandedAnswers, setExpandedAnswers] = useState<Record<string, boolean>>({});

  const handleCopy = async (url: string, index: number) => {
    await navigator.clipboard.writeText(url);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const getStatusBadgeClasses = (item: Partial<HistoryItem>) => {
    if (
      (item.status === "in-review" || item.status === "reviewed") &&
      item.answer
    ) {
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/50 dark:text-yellow-300 border-yellow-700";
    }
    if (item.status === "approved") {
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-700";
    }
    if (item.status === "rejected") {
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-700";
    }
    return "bg-primary/10 text-primary hover:bg-primary/10 border-primary";
  };

  const getStatusIcon = (item: HistoryItem) => {
    if (
      (item.status === "in-review" || item.status === "reviewed") &&
      item.answer
    ) {
      return <Target className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
    }
    if (item.approvedAnswer) {
      return (
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
      );
    }
    if (item.rejectedAnswer) {
      return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
    }
    if (item.modifiedAnswer) {
      return (
        <Pencil className="w-5 h-5 text-orange-600 dark:text-orange-400" />
      );
    }

    if (!item.answer) {
      return <Clock className="w-5 h-5 text-primary" />;
    }
    if (item.status === "approved") {
      return (
        <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
      );
    }
    if (item.status === "rejected") {
      return <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />;
    }
    return <Clock className="w-5 h-5 text-primary" />;
  };

  const getStatusText = (item: HistoryItem) => {
    if (
      (item.status === "in-review" || item.status === "reviewed") &&
      item.answer
    ) {
      return "Answer Created";
    }
    return item.status
      ? item.status.charAt(0).toUpperCase() + item.status.slice(1)
      : "";
  };

  const { rejectReRoute, isRejecting } = useReRouteRejectQuestion();

  const handleRejectReRouteAnswer = async (reason: string) => {
    if (reason.trim() === "") {
      toast.error("No reason provided for rejection");
      return;
    }
    if (reason.length < 8) {
      toast.error("Rejection reason must be at least 8 characters");
      return;
    }

    if (!selectedQuestionData?.history?.length) {
      console.warn("Selected question data not ready");
      return;
    }

    const h = selectedQuestionData.history?.[0];

    if (
      !h ||
      !h.rerouteId ||
      !h.question?._id ||
      !h.moderator?._id ||
      !h.reroute?.reroutedTo
    ) {
      console.error("Required data is missing for rejectReRoute");
      return;
    }

    try {
      await rejectReRoute({
        reason,
        rerouteId: h.rerouteId,
        questionId: h.question._id,
        moderatorId: h.moderator._id,
        expertId: h.reroute.reroutedTo,
        role: "expert",
      });

      setSelectedQuestion(null);
      refetchQuestions?.();
      toast.success("Successfully rejected the Re-Route Question");
    } catch (error) {
      console.error("Failed to reject reroute question:", error);
      toast.error("Failed to reject reroute question");
    }
  };

  return (
    <div className="space-y-4">
      {history.map((item, index) => {
        const isFirst = index === 0;
        const isMine = item.status === "in-review" && !item.answer;
        const modification = item.review?.answer?.modifications?.find(
          (mod) => mod.modifiedBy === item.updatedBy?._id
        );

        const baseKey = item.answer?._id?.toString() ?? `idx-${index}`;
        const answerKey = `${baseKey}-answer`;
        const reviewKey = `${baseKey}-review`;
        const remarksKey = `${baseKey}-remarks`;
        const rejectionKey = `${baseKey}-rejection`;
        const isAnyExpanded =
          expandedAnswers[answerKey] ||
          expandedAnswers[reviewKey] ||
          expandedAnswers[remarksKey] ||
          expandedAnswers[rejectionKey];

        return (
          <div key={(item.updatedBy?._id || "") + index} className="relative">
            {!isFirst && (
              <div className="absolute left-5 -top-1 bottom-0 h-6 w-0.5 bg-border/50 -translate-y-5" />
            )}

            <Card className="p-3.5 py-4 hover:shadow-md transition-shadow duration-200 border border-border/60 bg-card rounded-xl">
              <div className="flex gap-3">
                <div className="relative -top-1 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all bg-muted/40">
                  {getStatusIcon(item)}
                </div>

                <div className="flex-1 min-w-0 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      {/* USER ICON & NAME */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="font-semibold text-xs sm:text-sm text-foreground truncate max-w-[150px]">
                          {item?.updatedBy?.userName || "Author"}
                        </span>
                      </div>

                      {/* DATE */}
                      <span className="text-[11px] sm:text-xs text-muted-foreground">
                        • {item.createdAt ? formatDate(item.createdAt) : "—"}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {item.status === "approved" && item.answer && (
                        <Badge
                          variant="secondary"
                          className="gap-0.5 text-xs py-0.5"
                        >
                          <CheckCheck className="w-3 h-3" />
                          <span>{item.answer.approvalCount || "0"}</span>
                        </Badge>
                      )}
                      {item.status && (
                        <div className="flex items-center gap-2">
                          <Badge
                            className={`${getStatusBadgeClasses(
                              item
                            )} text-xs font-medium py-0.5`}
                          >
                            {getStatusText(item)}
                          </Badge>
                          {getStatusText(item) === "Answer Created" && (
                            <Badge
                              className={getStatusBadgeClasses({
                                status: "reviewed",
                              })}
                            >
                              Reviewed
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {(item.review?.parameters || item.review?.reason) && (
                    <div className="mt-4">
                      {/* REVIEW PARAMETERS */}
                      {item.review?.parameters &&
                        item.review?.action !== "accepted" && (
                          <div className="flex flex-wrap gap-2 mt-1 mb-2.5">
                            <div className="flex flex-wrap gap-1.5">
                              {Object.entries(item.review.parameters ?? {})
                                .filter(([_, value]) => value === false)
                                .map(([key]) => (
                                  <Badge
                                    key={key}
                                    variant="outline"
                                    className="flex items-center gap-1 px-2.5 py-0.5 text-xs rounded-full border bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                                  >
                                    <X className="w-3 h-3" />
                                    {parameterLabels[key as keyof typeof parameterLabels]}
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        )}

                      {/* REVIEW NOTE (MODIFY / REJECT) */}
                      {item.review?.reason && (
                        <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs sm:text-sm mt-2">
                          <span className="font-semibold text-muted-foreground block mb-1">
                            {item.review.action === "modified"
                              ? "Modification Note:"
                              : "Rejection Note:"}
                          </span>
                          <div className="text-foreground">
                            <ExpandableText
                              text={item.review.reason}
                              maxLength={0}
                              isExpanded={!!expandedAnswers[reviewKey]}
                              onToggle={() => {
                                setExpandedAnswers((prev) => ({
                                  ...prev,
                                  [reviewKey]: !prev[reviewKey],
                                }));
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {item.review?.action === "modified" && modification && (
                        <div className="mt-2.5">
                          <Accordion type="single" collapsible className="w-full">
                            <AccordionItem value={`mod-details-${item.review._id}`}>
                              <AccordionTrigger className="text-xs sm:text-sm font-medium py-2">
                                View Modification Details
                              </AccordionTrigger>
                              <AccordionContent>
                                {renderModificationDiff(modification)}
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1">
                    {item.approvedAnswer && (
                      <span className="text-xs px-2.5 py-1.5 w-full rounded-md border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 font-medium">
                        Answer Accepted
                      </span>
                    )}
                    {item.modifiedAnswer && (
                      <span className="text-xs px-2.5 py-1.5 w-full rounded-md border bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 font-medium">
                        Answer Modified
                      </span>
                    )}
                    {item.status === "in-review" && !item.answer && (
                      <span className="text-xs px-2.5 py-2.5 w-full rounded-md border bg-muted/40 text-muted-foreground font-medium flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" />
                        Awaiting response
                      </span>
                    )}
                  </div>

                  {item.answer && (
                    <div className="space-y-2.5 pt-1">
                      {/* HEADER WITH LABEL */}
                      <div className="flex justify-between items-center w-full px-0.5">
                        <Label className="text-xs sm:text-sm font-semibold text-foreground">
                          {item.status === "reviewed" ? "New Answer" : "Answer"}
                          {item.rejectedAnswer ? `: ${item.rejectedAnswer}` : ""}
                        </Label>
                      </div>

                      {/* ANSWER BOX */}
                      <div
                        className={`p-3.5 rounded-lg border bg-card/60 text-xs sm:text-sm relative transition-all duration-300 ${
                          isAnyExpanded
                            ? "max-h-[500px] overflow-y-auto"
                            : "max-h-64 overflow-y-hidden"
                        }`}
                      >
                        <ExpandableText
                          text={item.answer.answer}
                          maxLength={400}
                          isExpanded={!!expandedAnswers[answerKey]}
                          onToggle={() => {
                            setExpandedAnswers((prev) => ({
                              ...prev,
                              [answerKey]: !prev[answerKey],
                            }));
                          }}
                        />
                      </div>

                      {/* REJECTION REASON (IF REJECTED) */}
                      {item.status === "rejected" && item.reasonForRejection && (
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-xs sm:text-sm">
                          <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1 flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5" />
                            Rejection Reason:
                          </p>
                          <div className="text-foreground/90">
                            <ExpandableText
                              text={item.reasonForRejection}
                              maxLength={160}
                              isExpanded={!!expandedAnswers[rejectionKey]}
                              onToggle={() => {
                                setExpandedAnswers((prev) => ({
                                  ...prev,
                                  [rejectionKey]: !prev[rejectionKey],
                                }));
                              }}
                            />
                          </div>
                        </div>
                      )}

                      {/* SOURCES ACCORDION */}
                      {item.answer.sources && item.answer.sources.length > 0 && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="sources" className="border-none">
                            <AccordionTrigger className="flex items-center gap-2 text-xs sm:text-sm font-medium p-3 hover:bg-muted/50 rounded-lg shadow-sm border border-border/50">
                              <div className="flex items-center gap-2">
                                <Link2 className="h-4 w-4 text-muted-foreground" />
                                <span>Sources</span>
                                <Badge
                                  variant="secondary"
                                  className="h-5 px-1.5 flex items-center justify-center text-[11px]"
                                >
                                  {item.answer.sources.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-3 pt-2 space-y-2">
                              {sortSources(item.answer.sources).map(
                                (source: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-md border bg-muted/20 hover:bg-muted/40 transition-colors text-xs sm:text-sm"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {source.sourceType && (
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-muted text-muted-foreground border shrink-0">
                                          {getSourceBadgeLabel(source)}
                                        </span>
                                      )}
                                      <a
                                        href={source.source}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-blue-600 dark:text-blue-400 truncate hover:underline text-xs"
                                        title={source.source}
                                      >
                                        {source.source}
                                      </a>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      {source.page && (
                                        <span className="text-[11px] text-muted-foreground">
                                          pg {source.page}
                                        </span>
                                      )}
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleCopy(source.source, idx)}
                                        className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                        title="Copy URL"
                                      >
                                        {copiedIndex === idx ? (
                                          <Check className="w-3.5 h-3.5 text-green-500" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>
                                )
                              )}
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}

                      {/* REMARKS ACCORDION */}
                      {item.answer.remarks && (
                        <Accordion type="single" collapsible className="w-full">
                          <AccordionItem value="remarks" className="border-none">
                            <AccordionTrigger className="flex items-center gap-2 text-xs sm:text-sm font-medium p-3 hover:bg-muted/50 rounded-lg shadow-sm border border-border/50">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span>Remarks</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="p-3 pt-2">
                              <div className="p-3 rounded-md bg-muted/20 border text-xs sm:text-sm text-foreground">
                                <ExpandableText
                                  text={item.answer.remarks}
                                  maxLength={220}
                                  isExpanded={!!expandedAnswers[remarksKey]}
                                  onToggle={() => {
                                    setExpandedAnswers((prev) => ({
                                      ...prev,
                                      [remarksKey]: !prev[remarksKey],
                                    }));
                                  }}
                                />
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      )}

                      {/* COMMENTS SECTION */}
                      <div className="pb-1">
                        <Separator className="my-2" />
                        <CommentsSection
                          questionId={questionId}
                          answerId={item?.answer?._id?.toString()}
                          isMine={isMine}
                        />
                      </div>
                    </div>
                  )}

                  {!item.answer &&
                    !item.approvedAnswer &&
                    !item.rejectedAnswer &&
                    item.status === "in-review" && (
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        <AcceptReviewDialog
                          checklist={checklist}
                          onChecklistChange={setChecklist}
                          isSubmitting={isSubmittingAnswer}
                          onConfirm={handleAccept}
                        />

                        <Button
                          size="sm"
                          disabled={isSubmittingAnswer}
                          onClick={() => setIsRejectDialogOpen(true)}
                          variant="destructive"
                          className="gap-1 h-8 px-3 text-xs"
                        >
                          {isSubmittingAnswer &&
                          rejectionReason &&
                          isRejectionSubmitted ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Rejecting...
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              Reject
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          disabled={isSubmittingAnswer}
                          className="gap-1 h-8 px-3 text-xs bg-blue-600 dark:bg-blue-900 text-white hover:bg-blue-600"
                          onClick={() => setIsModifyDialogOpen(true)}
                        >
                          {isSubmittingAnswer &&
                          rejectionReason &&
                          isRejectionSubmitted ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Modifying...
                            </>
                          ) : (
                            <>
                              <Pencil className="w-3 h-3" />
                              Modify
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                  {item.answer && item.status === "re-routed" && (
                    <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                      <AcceptReviewDialog
                        checklist={checklist}
                        onChecklistChange={setChecklist}
                        isSubmitting={isSubmittingAnswer}
                        onConfirm={handleAccept}
                      />

                      <Button
                        size="sm"
                        disabled={isSubmittingAnswer}
                        onClick={() => setIsRejectDialogOpen(true)}
                        variant="destructive"
                        className="gap-1 h-8 px-3 text-xs"
                      >
                        {isSubmittingAnswer &&
                        rejectionReason &&
                        isRejectionSubmitted ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Rejecting...
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3" />
                            Reject
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        disabled={isSubmittingAnswer}
                        className="gap-1 h-8 px-3 text-xs bg-blue-600 dark:bg-blue-900 text-white hover:bg-blue-600"
                        onClick={() => setIsModifyDialogOpen(true)}
                      >
                        {isSubmittingAnswer &&
                        rejectionReason &&
                        isRejectionSubmitted ? (
                          <>
                            <Pencil className="w-3 h-3" />
                            Modify
                          </>
                        ) : (
                          <>
                            <Pencil className="w-3 h-3" />
                            Modify
                          </>
                        )}
                      </Button>

                      <Button
                        size="sm"
                        disabled={isSubmittingAnswer}
                        onClick={() => setRerouteModal(true)}
                        variant="destructive"
                        className="gap-1 h-8 px-3 text-xs"
                      >
                        <XCircle className="w-3 h-3" />
                        Reject ReRoute
                      </Button>

                      <Dialog open={rerouteModal} onOpenChange={setRerouteModal}>
                        <DialogContent className="max-w-lg">
                          <DialogHeader>
                            <DialogTitle>Rejection Reason *</DialogTitle>
                          </DialogHeader>
                          <Textarea
                            value={rejectReRouteReason}
                            onChange={(e) => setRejectReRouteReason(e.target.value)}
                            rows={6}
                            className="mt-2 h-[30vh]"
                            placeholder="Write your reason..."
                          />
                          <DialogFooter className="mt-4 gap-2">
                            <Button
                              variant="outline"
                              onClick={() => setRerouteModal(false)}
                            >
                              Cancel
                            </Button>
                            <Button
                              disabled={rejectReRouteReason.length < 8 || isRejecting}
                              onClick={() => {
                                handleRejectReRouteAnswer(rejectReRouteReason);
                                setRerouteModal(false);
                              }}
                            >
                              {isRejecting ? "Submitting..." : "Submit"}
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          </div>
        );
      })}
    </div>
  );
};
