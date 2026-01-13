import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
  QuestionRerouteRepo
} from "@/types";
import { Textarea } from "../../components/atoms/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../components/atoms/accordion";
import { Separator } from "../../components/atoms/separator";
import { CommentsSection } from "../../components/comments-section";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {useReRouteRejectQuestion} from '@/hooks/api/question/useReRouteRejectQuestion'
import { Card, CardContent, CardHeader, CardTitle } from "../../components/atoms/card";
import { formatDate } from "@/utils/formatDate";
import { Badge } from "../../components/atoms/badge";
import { ExpandableText } from "../../components/expandable-text";
import { Button } from "../../components/atoms/button";
import {
  CheckCircle,
  
  Info,
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
  
} from "lucide-react";
import { toast } from "sonner";
import { renderModificationDiff } from "../../components/question-details";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/atoms/dialog";
import { Label } from "../../components/atoms/label";
import { AcceptReviewDialog } from "./AcceptReviewDialog";
interface ReviewHistoryTimelineProps {
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
  selectedQuestionData?:IQuestion
  setSelectedQuestion:(value: string|null) => void;
  refetchQuestions?: () => void;
}
export const parameterLabels: Record<keyof IReviewParmeters, string> = {
  contextRelevance: "Context Relevance",
  technicalAccuracy: "Technical Accuracy",
  practicalUtility: "Practical Utility",
  valueInsight: "Value Insight",
  credibilityTrust: "Credibility & Trust",
  readabilityCommunication: "Readability",
};
export const ReviewHistoryTimeline = ({
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
  refetchQuestions
}: ReviewHistoryTimelineProps) => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [rejectReRouteReason,setRejectReRouteReason]=useState('')
  const [rerouteModal,setRerouteModal]=useState(false)

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
  const handleRejectReRouteAnswer = async(reason: string) => {
    if (reason.trim() === "") {
        toast.error("No reason provided for rejection");
          return;
        }
        if (reason.length < 8) {
          toast.error("Rejection reason must be atleast 8 letters");
          return;
        }
    
    if (!selectedQuestionData?.history?.length) {
      console.warn("Selected question data not ready");
      return;
    }
  
    
    const h = selectedQuestionData.history?.[0];

if (!h || !h.rerouteId || !h.question?._id || !h.moderator?._id || !h.reroute?.reroutedTo) {
  console.error("Required data is missing for rejectReRoute");
  return;
}

    try {
    await rejectReRoute({
        reason,
        rerouteId: h.rerouteId,
        questionId: h.question._id,
        moderatorId: h.moderator._id,
        expertId:h.reroute.reroutedTo,
        role:"expert"
      });
      
      setSelectedQuestion(null);
      
      // Refetch questions list
     /* if (refetchQuestions) {
       // console.log("the refetch happening===")
       // refetchQuestions(); // ✅ Call it here
      }*/
     toast.success("You have successfully rejected the Re Route Question");
    } catch (error) {
      console.log("the eroor coming====",error)
      console.error("Failed to reject reroute question:", error);
    }
};

  return (
    <div className="space-y-6">
      {history.map((item, index) => {
        const isFirst = index === 0;
        const isLast = index == history.length - 1;
        const isMine = item.status === "in-review" && !item.answer;
        const modification = item.review?.answer?.modifications?.find(
          (mod) => mod.modifiedBy === item.updatedBy._id
        );
        return (
          <div key={item.updatedBy?._id + index} className="relative">
            {!isFirst && (
              <div className="absolute left-5 -top-1 bottom-0 h-6 w-0.5 bg-border/50 -translate-y-5" />
            )}

            <Card className="p-3 py-6 hover:shadow-md transition-shadow duration-200 border border-border/50">
              <div className="flex gap-3">
                <div
                  className={`relative -top-1 flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all`}
                >
                  {getStatusIcon(item)}
                </div>

                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2 min-w-0 text-sm">
                      {/* USER ICON */}
                      <User className="w-4 h-4 text-muted-foreground flex-shrink-0" />

                      {/* NAME (TRUNCATE) */}
                      <span className="font-medium truncate max-w-[120px]">
                        {item?.updatedBy?.userName||"Author"}
                      </span>

                      {/* DATE */}
                      <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto">
                        {item.createdAt ? formatDate(item.createdAt) : "—"}
                      </span>

                      {/* AUTHOR BADGE */}
                      {/* {isLast && (
                        <span className="px-2 py-0.5 text-[10px] rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100 font-semibold flex-shrink-0">
                          Author
                        </span>
                      )} */}
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
                      {/* {item.status && (
                        <Badge
                          className={`${getStatusBadgeClasses(
                            item
                          )} text-xs font-medium py-0.5`}
                        >
                          {getStatusText(item)}
                        </Badge>
                      )} */}
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
                              className={`
                                        ${getStatusBadgeClasses({
                                          status: "reviewed",
                                        })}
                                        `}
                            >
                              Reviewed
                            </Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {(item.review?.parameters || item.review?.reason) && (
                    <div className="mt-10">
                      {/* REVIEW PARAMETERS */}
                      {item.review?.parameters &&
                        item.review?.action !== "accepted" && (
                          <div className="flex flex-wrap gap-2 mt-1 mb-3">
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(item.review.parameters ?? {})
                                .filter(([_, value]) => value === false)
                                .map(([key]) => (
                                  <Badge
                                    key={key}
                                    variant="outline"
                                    className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border 
                                      bg-red-100 text-red-800 border-red-300
                                      dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                                  >
                                    <X className="w-3 h-3" />

                                    {
                                      parameterLabels[
                                        key as keyof typeof parameterLabels
                                      ]
                                    }
                                  </Badge>
                                ))}
                            </div>
                          </div>
                        )}

                      {/* REVIEW NOTE (MODIFY / REJECT) */}
                      {item.review?.reason && (
                        <div className="p-3 rounded-md bg-muted/30 border border-border/50 text-sm mt-2">
                          <span className="dark:text-gray-200">
                            {item.review.action === "modified"
                              ? "Modification Note: "
                              : "Rejection Note: "}
                          </span>

                          <div className="text-foreground">
                            {/* {item.review.reason} */}
                            <ExpandableText
                              text={item.review.reason}
                              maxLength={0}
                            />
                          </div>
                        </div>
                      )}

                      {item.review?.action === "modified" && modification && (
                        <div className="mt-3">
                          <Accordion
                            type="single"
                            collapsible
                            className="w-full"
                          >
                            <AccordionItem
                              value={`mod-details-${item.review._id}`}
                            >
                              <AccordionTrigger className="text-sm font-medium">
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
                      <span className="text-sm px-2 py-2 w-full rounded border bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 ">
                        Answer Accepted
                      </span>
                    )}
                    {item.modifiedAnswer && (
                      <span
                        className="
                          text-sm px-2 py-2 w-full rounded border
                          bg-orange-100 dark:bg-orange-900/30
                          border-orange-300 dark:border-orange-700
                          text-orange-700 dark:text-orange-400
                        "
                      >
                        Answer Modified
                      </span>
                    )}

                    {item.status === "in-review" && !item.answer && (
                      <span className="text-sm px-2 py-4 w-full rounded border bg-muted/40 text-muted-foreground font-medium flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Awaiting response
                      </span>
                    )}
                  </div>

                  {item.answer && (
                    <div className="space-y-2 pt-1">
                      {item.answer && (
                        <div className="space-y-2 pt-1">
                          {/* ANSWER BOX */}
                          <div className="space-y-1 ">
                            {/* LABEL */}
                            <Label className="text-sm font-medium text-muted-foreground px-1 dark:text-gray-200">
                              {item.status == "reviewed" && "New "} Answer:{" "}
                              {item.rejectedAnswer}
                            </Label>

                            {/* ANSWER BOX */}
                            <div className="p-5 rounded-md border bg-card/50 text-sm relative">
                              <ExpandableText
                                text={item.answer.answer}
                                maxLength={350}
                              />

                              {(item.answer.sources?.length > 0 ||
                                item.reasonForRejection) && (
                                <Dialog>
                                  <DialogTrigger asChild>
                                    <button className="absolute bottom-2 right-2 text-xs px-2 py-1 border rounded-md hover:bg-muted/50 flex items-center gap-1">
                                      <Info className="w-3 h-3" />
                                      View Details
                                    </button>
                                  </DialogTrigger>

                                  <DialogContent className="max-w-md min-h-[25vh] max-h-[80vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle className="text-lg font-semibold">
                                        Answer Details
                                      </DialogTitle>
                                    </DialogHeader>

                                    <div className="space-y-5 text-sm">
                                      {/* SOURCES */}
                                      {item.answer.sources?.length > 0 && (
                                        <div className="space-y-2">
                                          <p className="text-sm font-semibold text-muted-foreground">
                                            Sources (
                                            {item.answer.sources.length})
                                          </p>

                                          <div className="space-y-2">
                                            {item.answer.sources.map(
                                              (source: any, idx: number) => (
                                                <div
                                                  key={idx}
                                                  className="flex items-center justify-between gap-2 p-3 border rounded-md hover:bg-muted/40 transition-colors text-sm"
                                                >
                                                  <a
                                                    href={source.source}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 dark:text-blue-400 break-all inline-flex items-center gap-1 hover:underline text-sm"
                                                  >
                                                    <span className="line-clamp-2">
                                                      {source.source}
                                                    </span>

                                                    {source.page && (
                                                      <>
                                                        <span className="text-muted-foreground flex-shrink-0">
                                                          •
                                                        </span>
                                                        <span className="text-muted-foreground flex-shrink-0">
                                                          p{source.page}
                                                        </span>
                                                      </>
                                                    )}
                                                  </a>

                                                  <button
                                                    onClick={() =>
                                                      handleCopy(
                                                        source.source,
                                                        idx
                                                      )
                                                    }
                                                    className="text-muted-foreground hover:text-foreground transition-colors p-1 flex-shrink-0"
                                                    title="Copy URL"
                                                  >
                                                    {copiedIndex === idx ? (
                                                      <Check className="w-4 h-4 text-green-500" />
                                                    ) : (
                                                      <Copy className="w-4 h-4" />
                                                    )}
                                                  </button>
                                                </div>
                                              )
                                            )}
                                          </div>
                                        </div>
                                      )}

                                      {item.answer.remarks && (
                                        <div className="p-3 rounded-md bg-muted/20 border text-sm">
                                          <p className="text-sm font-semibold text-muted-foreground mb-1">
                                            Remarks:
                                          </p>

                                          <div className="text-foreground text-sm">
                                            <ExpandableText
                                              text={item.answer.remarks}
                                              maxLength={220}
                                            />
                                          </div>
                                        </div>
                                      )}

                                      {/* REJECTION REASON */}
                                      {item.status === "rejected" &&
                                        item.reasonForRejection && (
                                          <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border text-sm">
                                            <p className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">
                                              Rejection Reason:
                                            </p>

                                            <div className="text-red-600 dark:text-red-300 text-sm">
                                              <ExpandableText
                                                text={item.reasonForRejection}
                                                maxLength={120}
                                              />
                                            </div>
                                          </div>
                                        )}
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {item.answer && (
                        <div className="pb-6">
                          <Separator className="my-2" />
                          <CommentsSection
                            questionId={questionId}
                            answerId={item?.answer?._id?.toString()}
                            isMine={isMine}
                          />
                        </div>
                      )}
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
                    
                    {item.answer &&
                    item.status === "re-routed" && (
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        <AcceptReviewDialog
                          checklist={checklist}
                          onChecklistChange={setChecklist}
                          isSubmitting={isSubmittingAnswer}
                          onConfirm={handleAccept}
                        />
                      {/* {item.answer && Number(item.answer.approvalCount) >= 3&&
                    item.status === "re-routed" && (
                      <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                        <AcceptReviewDialog
                          checklist={checklist}
                          onChecklistChange={setChecklist}
                          isSubmitting={isSubmittingAnswer}
                          onConfirm={handleAccept}
                        />
                        </div>
                    )}*/}

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
                        <Button
                          size="sm"
                          disabled={isSubmittingAnswer}
                          onClick={() => setRerouteModal(true)}
                          variant="destructive"
                          className="gap-1 h-8 px-3 text-xs "
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
      {/* Cancel */}
      <Button
        variant="outline"
        onClick={() => setRerouteModal(false)}
      >
        Cancel
      </Button>

      {/* Submit */}
      <Button
       disabled={rejectReRouteReason.length<8}
        onClick={() => {
          handleRejectReRouteAnswer(rejectReRouteReason);
          setRerouteModal(false);
        }}
      >
        {isSubmittingAnswer ? "Submitting..." : "Submit"}
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