import type { IAnswer, SourceItem } from "@/types";
import { ExternalLink } from "lucide-react";

interface AnswerContentProps {
  answer: IAnswer;
}

const sourceTypeLabels: Record<string, string> = {
  hyper_local: "Hyper Local",
  state: "State",
  central: "Central",
  other: "Other",
};

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

const getSourceBadgeLabel = (item: SourceItem) => {
  const typeLabel = sourceTypeLabels[item.sourceType || ""] || item.sourceType || "";
  if (item.sourceType === "other" && item.sourceName && item.sourceName.toLowerCase() !== "other") {
    return `${typeLabel}: ${item.sourceName}`;
  }
  return typeLabel;
};

export const AnswerContent = ({ answer }: AnswerContentProps) => {
  const sortedSources = answer.sources?.length ? sortSources(answer.sources) : [];

  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="whitespace-pre-wrap leading-relaxed line-clamp-4 text-card-foreground px-5">
        {answer.answer}
      </p>

      {sortedSources.length > 0 && (
        <div className="mt-4 px-5 pt-4 border-t border-border">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Source References
          </h4>
          <div className="space-y-2">
            {sortedSources.map((item, idx) => (
              <div key={idx} className="flex items-center gap-2 text-sm">
                {item.sourceType && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20">
                    {getSourceBadgeLabel(item)}
                  </span>
                )}
                {/* Show sourceName separately only for non-other types when it's a unique name */}
                {item.sourceName &&
                  item.sourceType !== "other" &&
                  item.sourceName.toLowerCase() !== (sourceTypeLabels[item.sourceType || ""] || "").toLowerCase() && (
                    <span className="text-xs font-medium text-muted-foreground">
                      {item.sourceName}
                    </span>
                  )}

                <a
                  href={item.source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800 hover:underline truncate max-w-md flex items-center gap-1"
                >
                  {item.source}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
                {item.page && (
                  <span className="text-xs text-muted-foreground">
                    (p.{item.page})
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
