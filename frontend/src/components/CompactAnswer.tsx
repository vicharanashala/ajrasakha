import { Clock, XCircle } from "lucide-react";
import { Badge } from "./atoms/badge";

export default function CompactAnswerTimeline({ answers, onSelect, selected }: { answers: any; onSelect: any; selected: any }) {
  console.log("Answer from compact->", answers);
  return (
    <div className="relative w-full">
      {/* Timeline Line */}

      <div className="relative flex items-center justify-between gap-6">
        {answers.map((ans: any, index: any) => {
          const reviews = ans.reviews || [];

          const hasRejected = reviews.some(
            (review: any) => review.action === "rejected",
          );

          const acceptedCount = reviews.filter(
            (review: any) => review.action === "accepted",
          ).length;

          const hasThreeApprovals = acceptedCount >= 3;

          const isFinal = ans.isFinalAnswer === true;

          const isRejected = hasRejected;

          const isInReview = hasThreeApprovals && !isFinal && !isRejected;

          const isApproved =
            acceptedCount > 0 && !isRejected && !isFinal && !isInReview;

          return (
            <div key={ans._id} className="relative flex-1">
              {index !== answers.length - 1 && (
                <div
                  className="
      absolute
      top-2
      left-1/2
      w-full
      h-[2px]
      bg-border
      z-0
    "
                />
              )}

              {/* Timeline Dot */}
              <div
                className={`
    relative
    z-10
    mx-auto
    mb-4
    w-4
    h-4
    rounded-full
    border-4

    ${isRejected
                    ? "bg-red-500 border-red-300"
                    : isFinal || isApproved
                      ? "bg-green-500 border-green-300"
                      : "bg-amber-400 border-amber-200"
                  }
  `}
              />

              {/* Card */}
              <div
                onClick={() => onSelect(ans)}
                className={`
              mt-4
              cursor-pointer
              rounded-xl
              border
              p-4
              transition-all
              min-h-[110px]

              ${selected?._id === ans._id ? "ring-2 ring-primary" : ""}

              ${isApproved
                    ? "bg-green-500/10 border-green-500"
                    : isRejected
                      ? "bg-red-500/10 border-red-500"
                      : "bg-card border-border"
                  }
            `}
              >
                {/* Iteration */}
                <div className="flex items-center justify-between">
                  <p className="font-semibold">Iteration {index + 1}</p>

                  {acceptedCount > 0 && (
                    <span className="text-xs text-green-400 font-medium">
                      {acceptedCount} Approvals
                    </span>
                  )}
                </div>

                {/* Badge */}
                <div className="mt-4">
                  {isFinal && (
                    <Badge
                      variant="outline"
                      className="text-green-600 border-green-600"
                    >
                      Final
                    </Badge>
                  )}

                  {isRejected && (
                    <Badge className="bg-rejected text-red-500 border-rejected">
                      <XCircle className="w-3 h-3 mr-1" />
                      Rejected
                    </Badge>
                  )}

                  {isInReview && (
                    <Badge className="bg-amber-950 text-amber-300 border border-amber-900">
                      <Clock className="w-3 h-3 mr-1 opacity-80" />
                      In Review
                    </Badge>
                  )}

                  {isApproved && (
                    <Badge
                      variant="outline"
                      className="text-green-500 border-green-500"
                    >
                      Approved
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
