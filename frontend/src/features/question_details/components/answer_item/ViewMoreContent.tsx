// components/ViewMoreContent.tsx
import type { IAnswer, ISubmissionHistory, QuestionStatus } from "@/types";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Badge } from "@/components/atoms/badge";
import { XCircle, Clock, AlertCircle, ArrowUpRight } from "lucide-react";
import { formatDate } from "@/utils/formatDate";
import { ExpandableText } from "@/components/expandable-text";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { ReviewTimeline } from "./ReviewTimeline";

interface ViewMoreContentProps {
  answer: IAnswer;
  submissionData?: ISubmissionHistory;
  isRejected: boolean;
  questionStatus: QuestionStatus;
  lastAnswerId: string;
  reviews: any[];
  firstTrueIndex?: number;
  firstFalseOrMissingIndex?: number;
}

export const ViewMoreContent = ({
  answer,
  submissionData,
  isRejected,
  questionStatus,
  lastAnswerId,
  reviews,
  firstTrueIndex,
  firstFalseOrMissingIndex,
}: ViewMoreContentProps) => {
  const showRejectedBadge =
    submissionData?.rejectedAnswer ||
    (isRejected && !submissionData?.isReroute) ||
    (submissionData?.isReroute &&
      submissionData?.status === "rejected" &&
      lastAnswerId !== answer?._id);

  const showInReviewBadge =
    ((questionStatus === "in-review" || questionStatus === "re-routed") &&
      lastAnswerId === answer?._id) ||
    (!isRejected &&
      !submissionData?.rejectedAnswer &&
      questionStatus !== "in-review" &&
      questionStatus !== "re-routed" &&
      questionStatus !== "closed");

  return (
    <div className="space-y-6 p-4">
      <div className="grid gap-4 text-sm">
        <div className="flex flex-col sm:flex-row justify-between gap-3">
          <div className="flex items-center gap-4">
            <span className="font-medium">
              Iteration:{" "}
              <span className="text-foreground font-normal">
                {answer.answerIteration}
              </span>
            </span>

            {showRejectedBadge && (
              <Badge className="bg-rejected text-red-500 dark:text-red-700 border-rejected hover:bg-rejected/90">
                <XCircle className="w-3 h-3 mr-1" />
                Rejected
              </Badge>
            )}

            {showInReviewBadge && (
              <Badge className="bg-amber-50 text-amber-700 border border-amber-100 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900 dark:hover:bg-amber-900">
                <Clock className="w-3 h-3 mr-1 opacity-80" />
                In Review
              </Badge>
            )}
          </div>

          <div className="flex flex-col text-muted-foreground text-xs">
            <span>Submitted At: {formatDate(answer.createdAt!)}</span>
          </div>
        </div>

        {submissionData?.updatedBy && (
          <div className="rounded-lg border bg-muted/50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                Submitted By:{" "}
                <span className="text-sm text-muted-foreground">
                  {submissionData.updatedBy?.name}
                  {submissionData.updatedBy?.email && (
                    <> ({submissionData.updatedBy.email})</>
                  )}
                </span>
              </p>

              {answer.threshold > 0 && (
                <Badge
                  variant="outline"
                  className="text-foreground border border-muted-foreground w-fit flex items-center gap-1"
                >
                  <span className="font-medium">Correctness:</span>
                  <span>{Math.round(answer.threshold * 100)}%</span>
                </Badge>
              )}
            </div>
          </div>
        )}
      </div>

      {isRejected && submissionData && submissionData.reasonForRejection && (
        <div className="rounded-lg border border-rejected bg-rejected-bg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 dark:text-red-700 mt-0.5 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-red-500 dark:text-red-700">
                Rejection Reason
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {submissionData.reasonForRejection}
              </p>
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-foreground mb-3">
          Answer Content
        </p>
        <div className="rounded-lg border bg-muted/30 h-[30vh]">
          <ScrollArea className="h-full">
            <div className="p-4">
              <p className="text-foreground">{answer.answer}</p>
            </div>
          </ScrollArea>
        </div>
      </div>

      {answer.remarks && (
        <div className="p-3 rounded-md bg-muted/20 border text-sm">
          <p className="text-sm font-semibold text-muted-foreground mb-1">
            Remarks:
          </p>
          <div className="text-foreground text-sm">
            <ExpandableText text={answer.remarks} maxLength={120} />
          </div>
        </div>
      )}

      {answer.sources?.length > 0 && (
        <div>
          <p className="text-sm font-medium text-foreground mb-3">
            Source URLs
          </p>
          <div className="space-y-2">
            {answer.sources.map((source, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border bg-muted/30 p-2 pr-3"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span
                        className="text-sm truncate max-w-[260px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                        onClick={() => window.open(source.source, "_blank")}
                      >
                        {source.source}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{source.source}</TooltipContent>
                  </Tooltip>

                  {source.page && (
                    <>
                      <span className="text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">
                        page {source.page}
                      </span>
                    </>
                  )}
                </div>
                <a
                  href={source.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 rounded hover:bg-muted/20 dark:hover:bg-muted/50 transition-colors"
                >
                  <ArrowUpRight className="w-4 h-4 text-foreground/80" />
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {reviews && reviews.length > 0 && (
        <ReviewTimeline
          reviews={reviews}
          firstTrueIndex={firstTrueIndex}
          firstFalseOrMissingIndex={firstFalseOrMissingIndex}
        />
      )}
    </div>
  );
};
