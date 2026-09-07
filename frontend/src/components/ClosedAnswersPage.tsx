import { useState } from "react";
import { Search, Link as LinkIcon, Eye } from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import Spinner from "@/components/atoms/spinner";
import { QuestionIdLink } from "@/features/chatbotDashboard/components/QuestionIdLink";
import { Pagination } from "./pagination";
import { useGetClosedAnswers } from "@/hooks/api/answer/useGetClosedAnswers";
import { useDebounce } from "@/hooks/ui/useDebounce";
import type { ClosedAnswer, SourceItem } from "@/types";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

const QUESTION_STATUS_STYLES: Record<string, { badge: string; dot: string }> = {
  closed: {
    badge: "bg-slate-500/10 text-slate-300 border-slate-500/25",
    dot: "bg-slate-400",
  },
  dynamic_closed: {
    badge: "bg-blue-500/10 text-blue-300 border-blue-500/25",
    dot: "bg-blue-400",
  },
  duplicate_closed: {
    badge: "bg-purple-500/10 text-purple-300 border-purple-500/25",
    dot: "bg-purple-400",
  },
  approved: {
    badge: "bg-green-500/10 text-green-700 dark:text-green-300 border-green-500/25",
    dot: "bg-green-500",
  },
  rejected: {
    badge: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25",
    dot: "bg-red-500",
  },
  modified: {
    badge: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-300 border-yellow-500/25",
    dot: "bg-yellow-500",
  },
  reviewed: {
    badge: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/25",
    dot: "bg-indigo-500",
  },
};

const DEFAULT_STATUS_STYLE = {
  badge: "bg-muted text-foreground border-border",
  dot: "bg-muted-foreground",
};

const QuestionStatusBadge = ({ status }: { status?: string }) => {
  if (!status) return null;
  const style = QUESTION_STATUS_STYLES[status] ?? DEFAULT_STATUS_STYLE;
  return (
    <Badge
      variant="outline"
      className={`shrink-0 gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium capitalize shadow-sm ${style.badge}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />
      {status.replace(/_/g, " ")}
    </Badge>
  );
};

const ID_CHIP_CLASSES =
  "truncate rounded-md border border-border/60 bg-background/60 px-1.5 py-0.5 font-mono text-[11px]";

const IdChip = ({
  label,
  value,
  clickable = false,
}: {
  label: string;
  value: string;
  clickable?: boolean;
}) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
      {label}
    </span>
    {clickable ? (
      <span title={value} className="min-w-0">
        <QuestionIdLink
          questionId={value}
          className={`${ID_CHIP_CLASSES} text-primary hover:border-primary/50 hover:underline`}
        >
          {value}
        </QuestionIdLink>
      </span>
    ) : (
      <span title={value} className={`${ID_CHIP_CLASSES} text-foreground/80`}>
        {value}
      </span>
    )}
  </div>
);

export const formatAiTags = (text: string) => {
  if (!text) return "—";

  // 1. Replace key-value tags: <tag>value</tag> -> "Tag: value"
  let formatted = text.replace(/<([^>]+)>([^<]*)<\/\1>/g, (match, tag, value) => {
    const label = tag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return `${label}: ${value.trim()}`;
  });

  // 2. Replace standalone opening tags: <tag> -> "\nTag:\n"
  formatted = formatted.replace(/<([^\/][^>]*)>/g, (match, tag) => {
    const label = tag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return `\n${label}:\n`;
  });

  // 3. Remove all remaining closing tags: </tag> -> ""
  formatted = formatted.replace(/<\/[^>]+>/g, '');

  // 4. Cleanup excessive newlines
  formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();

  return formatted || "—";
};

const AnswerMetaPanel = ({ answer, showBothStatuses = false }: { answer: ClosedAnswer; showBothStatuses?: boolean }) => (
  <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/40 p-2.5 sm:flex-row sm:items-start sm:justify-between">
    <div className="flex min-w-0 flex-col gap-1">
      <IdChip label="Question ID" value={answer.questionId || "—"} clickable />
      <IdChip label="Answer ID" value={answer._id} />
      {answer.author?.name && <IdChip label="Author" value={answer.author.name} />}
      {answer.approvedBy?.name && <IdChip label="Approved By" value={answer.approvedBy.name} />}
    </div>
    <div className="flex flex-col items-end gap-1">
      <QuestionStatusBadge status={answer.status || "approved"} />
      {showBothStatuses && <QuestionStatusBadge status={answer.question?.status} />}
    </div>
  </div>
);

const SourceRow = ({ source }: { source: SourceItem }) => {
  const label = source.sourceName || source.source;
  return (
    <li className="flex items-start gap-1.5 text-xs">
      <LinkIcon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
      {isUrl(source.source) ? (
        <a
          href={source.source}
          target="_blank"
          rel="noopener noreferrer"
          className="break-all text-primary hover:underline"
        >
          {label}
        </a>
      ) : (
        <span className="break-all text-foreground/90">{label || "—"}</span>
      )}
    </li>
  );
};

const SourcesList = ({ sources }: { sources: SourceItem[] }) => {
  if (!sources || sources.length === 0) {
    return <p className="text-xs text-muted-foreground">No sources provided.</p>;
  }
  return (
    <ul className="space-y-1">
      {sources.map((source, idx) => (
        <SourceRow key={idx} source={source} />
      ))}
    </ul>
  );
};

const CARD_HEIGHT = "h-[380px]";

const ClosedAnswerCard = ({ answer }: { answer: ClosedAnswer }) => {
  return (
    <div className={`flex ${CARD_HEIGHT} flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm`}>
      <AnswerMetaPanel answer={answer} />

      <div className="min-h-0 flex-1 overflow-hidden">
        <p className="line-clamp-6 text-sm text-foreground/90 whitespace-pre-wrap break-words">
          {formatAiTags(answer.answer)}
        </p>
      </div>

      <div className="shrink-0 max-h-16 overflow-y-auto border-t border-border/60 pt-2">
        <p className="mb-1.5 text-xs font-semibold text-foreground/80">
          Sources {answer.sources?.length ? `(${answer.sources.length})` : ""}
        </p>
        <SourcesList sources={answer.sources} />
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="w-full shrink-0">
            <Eye className="h-3.5 w-3.5" />
            View More
          </Button>
        </DialogTrigger>
        <DialogContent className="flex h-[80vh] w-[90vw] max-w-2xl flex-col">
          <DialogHeader className="shrink-0 border-b pb-3">
            <DialogTitle>Answer Details</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1">
            <div className="space-y-4 pr-4">
              <AnswerMetaPanel answer={answer} showBothStatuses={true} />
              <p className="text-sm text-foreground/90 whitespace-pre-wrap break-words">
                {formatAiTags(answer.answer)}
              </p>
              <div className="border-t border-border/60 pt-3">
                <p className="mb-1.5 text-xs font-semibold text-foreground/80">
                  Sources {answer.sources?.length ? `(${answer.sources.length})` : ""}
                </p>
                <SourcesList sources={answer.sources} />
              </div>
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export const ClosedAnswersPage = () => {
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const debouncedSearch = useDebounce(search);

  const { data, isLoading, isFetching, error } = useGetClosedAnswers(
    currentPage,
    limit,
    debouncedSearch,
  );

  const answers = data?.answers ?? [];
  const totalAnswers = data?.totalAnswers ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalAnswers / limit));

  return (
    <div className="w-full min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Closed Answers</CardTitle>
              <CardDescription>
                Every answer submitted for a question that has been closed
                {totalAnswers > 0 && ` — ${totalAnswers.toLocaleString()} total`}
              </CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search question or answer..."
                className="pl-8"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-destructive/40 py-16 text-sm text-destructive">
              Failed to load closed answers. Please try again.
            </div>
          ) : isLoading ? (
            <div className="relative min-h-[300px] w-full">
              <Spinner fullScreen={false} text="Loading closed answers" />
            </div>
          ) : answers.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-border py-16 text-sm text-muted-foreground">
              No closed answers found.
            </div>
          ) : (
            <>
              <div
                className={`grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 ${
                  isFetching ? "opacity-60 transition-opacity" : ""
                }`}
              >
                {answers.map((answer) => (
                  <ClosedAnswerCard key={answer._id} answer={answer} />
                ))}
              </div>
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                limit={limit}
                onLimitChange={(value) => {
                  setLimit(value);
                  setCurrentPage(1);
                }}
              />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
