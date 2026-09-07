import { useState } from "react";
import { Search, Link as LinkIcon } from "lucide-react";
import { Input } from "@/components/atoms/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/atoms/card";
import Spinner from "@/components/atoms/spinner";
import { Pagination } from "./pagination";
import { useGetClosedAnswers } from "@/hooks/api/answer/useGetClosedAnswers";
import { useDebounce } from "@/hooks/ui/useDebounce";
import type { ClosedAnswer, SourceItem } from "@/types";

const isUrl = (value: string) => /^https?:\/\//i.test(value);

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

const ClosedAnswerCard = ({ answer }: { answer: ClosedAnswer }) => {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground/80">Question ID:</span>{" "}
          <span className="break-all font-mono">{answer.questionId || "—"}</span>
        </span>
        <span>
          <span className="font-semibold text-foreground/80">Answer ID:</span>{" "}
          <span className="break-all font-mono">{answer._id}</span>
        </span>
      </div>

      <p className="text-sm text-foreground/90 whitespace-pre-wrap">
        {answer.answer || "—"}
      </p>

      <div className="mt-auto pt-2 border-t border-border/60">
        <p className="mb-1.5 text-xs font-semibold text-foreground/80">
          Sources {answer.sources?.length ? `(${answer.sources.length})` : ""}
        </p>
        {answer.sources && answer.sources.length > 0 ? (
          <ul className="space-y-1">
            {answer.sources.map((source, idx) => (
              <SourceRow key={idx} source={source} />
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No sources provided.</p>
        )}
      </div>
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
