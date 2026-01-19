import type { IQuestionFullData, IUser } from "@/types";
import { Card } from "@/components/atoms/card";
import { Separator } from "@/components/atoms/separator";
import { Button } from "@/components/atoms/button";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  FileText,
  Gauge,
  Landmark,
  Layers,
  Link2,
  MapPin,
  Sprout,
} from "lucide-react";
import { useState } from "react";

interface QuestionDetailsCardProps {
  question: IQuestionFullData;
  currentUser: IUser;
}

export const QuestionDetailsCard = ({
  question,
  currentUser,
}: QuestionDetailsCardProps) => {
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showFullContext, setShowFullContext] = useState(false);

  const metrics = question.metrics;
  const context = question.context;

  return (
    <Card className="p-4 grid gap-4">
      <p className="text-sm font-medium">Details</p>

      {/* Basic Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2">
          <MapPin className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">State</span>
            <span className="truncate">{question.details?.state || "-"}</span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Landmark className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">District</span>
            <span className="truncate">
              {question.details?.district || "-"}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Sprout className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Crop</span>
            <span className="truncate">{question.details?.crop || "-"}</span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Season</span>
            <span className="truncate">{question.details?.season || "-"}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 sm:col-span-2">
          <Layers className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Domain</span>
            <span className="truncate">{question.details?.domain || "-"}</span>
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-start gap-2 text-sm">
        <Link2 className="w-4 h-4 text-primary shrink-0" />
        <div className="flex flex-col">
          <span className="text-muted-foreground">Source</span>
          <span className="truncate">{question.source || "-"}</span>
        </div>
      </div>

      {showMoreDetails && (
        <>
          <Separator className="my-2" />

          {context && (
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground">Context</span>
              </div>

              <p className="text-muted-foreground ml-6">
                {showFullContext || context.length <= 180
                  ? context
                  : `${context.slice(0, 180)}... `}
                {context.length > 180 && (
                  <button
                    onClick={() => setShowFullContext((prev) => !prev)}
                    className="text-primary text-xs font-medium"
                  >
                    {showFullContext ? "Show less" : "Read more"}
                  </button>
                )}
              </p>
            </div>
          )}

          {metrics && (
            <div className="grid gap-2 text-sm">
              <div className="flex items-center gap-2 mt-1">
                <Gauge className="w-4 h-4 text-primary" />
                <span className="text-muted-foreground font-medium">
                  Metrics
                </span>
              </div>

              <div className="ml-6 grid grid-cols-1 sm:grid-cols-2 gap-1 text-muted-foreground">
                <span>Mean Similarity:</span>
                <span>{metrics.mean_similarity.toFixed(2)}</span>

                <span>Std Deviation:</span>
                <span>{metrics.std_similarity.toFixed(2)}</span>

                <span>Recent Similarity:</span>
                <span>{metrics.recent_similarity.toFixed(2)}</span>

                <span>Collusion Score:</span>
                <span>{metrics.collusion_score.toFixed(2)}</span>
              </div>
            </div>
          )}
        </>
      )}

      {currentUser.role !== "expert" && (context || metrics) && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 flex items-center gap-1 text-primary"
          onClick={() => setShowMoreDetails((prev) => !prev)}
        >
          {showMoreDetails ? (
            <>
              <ChevronUp className="w-4 h-4" /> View Less
            </>
          ) : (
            <>
              <ChevronDown className="w-4 h-4" /> View More
            </>
          )}
        </Button>
      )}
    </Card>
  );
};
