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
  Leaf,
  Link2,
  Mail,
  MapPin,
  Sprout,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

interface QuestionDetailsCardProps {
  question: IQuestionFullData;
  currentUser: IUser;
}

function ThreadIdLink({ threadId }: { threadId: string }) {
  const navigate = useNavigate();

  const extractDate = (id: string): string => {
    const parts = id.split("-");
    // Handle format: 919876543210-2025-05-08 (YYYY-MM-DD)
    if (parts.length === 4) {
      return `${parts[1]}-${parts[2]}-${parts[3]}`;
    }
    // Handle format: 919876543210-20260508 (YYYYMMDD)
    if (parts.length === 2 && parts[1].length === 8) {
      const d = parts[1];
      return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    }
    // fallback: today
    return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  };

  const handleClick = () => {
    const cleanThreadId = threadId.replace(/"/g, '');
    navigate({
      to: "/whatsapp-history",
      search: {
        threadId: cleanThreadId,
        date: extractDate(cleanThreadId),
      },
    });
  };

  return (
    <button
      onClick={handleClick}
      className="max-w-[220px] truncate rounded-md border bg-muted px-2 py-1 text-xs font-medium text-foreground hover:bg-accent hover:text-primary transition-colors cursor-pointer"
      title="View WhatsApp thread history"
    >
      {threadId.replace(/"/g, '')}
    </button>
  );
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
          <Leaf className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Normalized Crop</span>
            <span className="truncate capitalize">
              {question.details?.normalised_crop || "-"}
            </span>
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Calendar className="w-4 h-4 text-primary shrink-0" />
          <div className="flex flex-col">
            <span className="text-muted-foreground">Season</span>
            <span className="truncate">{question.details?.season || "-"}</span>
          </div>
        </div>

        <div className="flex items-start gap-2 overflow-hidden">
          <Layers className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="flex flex-col min-w-0">
            <span className="text-muted-foreground">Domain</span>
            <span
              className="truncate"
              title={
                Array.isArray(question.details?.domain)
                  ? question.details.domain.join(", ")
                  : (question.details?.domain as string | undefined) ?? ""
              }
            >
              {Array.isArray(question.details?.domain) && question.details.domain.length > 0
                ? question.details.domain.join(", ")
                : typeof question.details?.domain === "string" && question.details.domain
                ? question.details.domain
                : "-"}
            </span>
          </div>
        </div>
      </div>

      <Separator />

      <div className="flex items-start justify-between gap-4 text-sm">
        <div className="flex items-start gap-2">
          <Link2 className="w-4 h-4 text-primary shrink-0" />

          <div className="flex flex-col">
            <span className="text-muted-foreground">Source</span>
            <span className="truncate">{question.source || "-"}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 min-w-0">
          {question.source === "WHATSAPP" && question.threadId && (
            <div className="flex flex-col items-end min-w-0">
              <span className="text-muted-foreground">
                {question.threadUserEmail && <span className="mr-1">({question.threadUserEmail})</span>}
                WhatsApp Thread ID:
              </span>
              <ThreadIdLink threadId={question.threadId} />
            </div>
          )}

          {question.source !== "WHATSAPP" && question.threadId && (
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">
                {question.threadUserEmail && <span className="mr-1">({question.threadUserEmail})</span>}
                Thread ID:
              </span>
              <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium text-foreground break-all">
                {question.threadId}
              </span>
            </div>
          )}

          {question.messageId && (
            <div className="flex flex-col items-end">
              <span className="text-muted-foreground">Message ID</span>
              <span className="rounded-md border bg-muted px-2 py-1 text-xs font-medium text-foreground break-all">
                {question.messageId}
              </span>
            </div>
          )}
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
