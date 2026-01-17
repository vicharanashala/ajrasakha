// components/ReviewTimeline.tsx
import { Badge } from "lucide-react";
import { CheckCircle, XCircle, Pencil, Check, X } from "lucide-react";
import { formatDate } from "@/utils/formatDate";
import { parameterLabels } from "../../../qa-interface-page/ReviewHistoryTimeline";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/atoms/accordion";
import { renderModificationDiff } from "../renderModificationDiff";

interface ReviewTimelineProps {
  reviews: any[];
  firstTrueIndex?: number;
  firstFalseOrMissingIndex?: number;
}

export const ReviewTimeline = ({
  reviews,
  firstTrueIndex,
  firstFalseOrMissingIndex,
}: ReviewTimelineProps) => {
  return (
    <div className="mt-6">
      <div className="space-y-4">
        {reviews.map((review, index) => {
          const modification = review?.answer?.modifications?.find(
            (mod: any) => mod.modifiedBy === review.reviewerId
          );

          return (
            <div key={review._id}>
              {index === firstTrueIndex && (
                <p className="text-sm font-medium text-purple-600 mb-2">
                  ReRoute Timeline
                </p>
              )}

              {index === firstFalseOrMissingIndex && (
                <p className="text-sm font-medium text-blue-600 mb-2">
                  Review Timeline
                </p>
              )}

              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                {/* Reviewer + Date */}
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Reviewer:</span>
                    <span className="text-sm text-muted-foreground">
                      {review.reviewer?.firstName}
                      {review.reviewer?.email && (
                        <> ({review.reviewer.email})</>
                      )}
                    </span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    {formatDate(review.createdAt!)}
                  </div>
                </div>

                {/* Action Badge */}
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      review.action === "accepted"
                        ? "border-green-600 text-green-600"
                        : review.action === "rejected"
                          ? "border-red-600 text-red-600"
                          : "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700"
                    }
                  >
                    <span className="flex items-center gap-1">
                      {review.action === "accepted" && (
                        <>
                          <CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400" />
                          <span>Accepted</span>
                        </>
                      )}

                      {review.action === "rejected" && (
                        <>
                          <XCircle className="w-3 h-3 text-red-600 dark:text-red-400" />
                          <span>Rejected</span>
                        </>
                      )}

                      {review.action === "modified" && (
                        <>
                          <Pencil className="w-3 h-3 text-orange-700 dark:text-orange-400" />
                          <span>Modified</span>
                        </>
                      )}
                    </span>
                  </Badge>
                </div>

                {/* Parameters */}
                <div className="space-y-1">
                  <p className="text-xs mb-2 font-medium text-foreground">
                    Parameters
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(review.parameters ?? {}).map(
                      ([key, value]) => (
                        <Badge
                          key={key}
                          variant="outline"
                          className={`flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border ${
                            value
                              ? "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700"
                              : "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700"
                          }`}
                        >
                          {value ? (
                            <Check className="w-3 h-3" />
                          ) : (
                            <X className="w-3 h-3" />
                          )}
                          {parameterLabels[key as keyof typeof parameterLabels]}
                        </Badge>
                      )
                    )}
                  </div>
                </div>

                {/* Reason */}
                {review.reason && review.reason.trim() !== "" && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-foreground">
                      Reason
                    </p>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                      {review.reason}
                    </p>
                  </div>
                )}

                {/* Modification Accordion */}
                {review.action === "modified" && modification && (
                  <div className="mt-3">
                    <Accordion type="single" collapsible className="w-full">
                      <AccordionItem value={`mod-details-${review._id}`}>
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
            </div>
          );
        })}
      </div>
    </div>
  );
};
