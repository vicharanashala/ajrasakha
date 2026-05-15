import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import type { IQuestionFullData } from "@/types";
import { BookOpen, ExternalLink, FileText } from "lucide-react";

interface ClosedFinalAnswerModalProps {
  question: IQuestionFullData;
}

export const ClosedFinalAnswerModal = ({
  question,
}: ClosedFinalAnswerModalProps) => {
  const finalAnswer = question.closedFinalAnswer;

  if (!finalAnswer) return null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BookOpen className="w-4 h-4" />
          View Final Answer
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <div className="p-2 rounded-lg bg-green-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-green-600" />
            </div>
            Final Answer
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-hidden mt-2 pr-2">
          <div className="space-y-6">
            {/* Answer */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Answer
              </p>
              <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                {finalAnswer.answer}
              </p>
            </div>

            {/* Sources */}
            {finalAnswer.sources && finalAnswer.sources.length > 0 && (
              <div>
                <p className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                  Sources ({finalAnswer.sources.length})
                </p>
                <div className="space-y-2">
                  {finalAnswer.sources.map((src, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
                    >
                      <div className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                        {i + 1}
                      </div>
                      <div className="flex-1 min-w-0 space-y-0.5">
                        {src.sourceName && (
                          <p className="text-sm font-medium text-foreground truncate">
                            {src.sourceName}
                          </p>
                        )}
                        {src.source && (
                          <a
                            href={src.source}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline flex items-center gap-1 truncate"
                          >
                            {src.source}
                            <ExternalLink className="w-3 h-3 flex-shrink-0" />
                          </a>
                        )}
                        {src.sourceType && (
                          <span className="inline-block text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                            {src.sourceType}
                          </span>
                        )}
                        {src.page != null && (Array.isArray(src.page) ? src.page.length > 0 : true) && (
                          <span className="text-xs text-muted-foreground">
                            Page {Array.isArray(src.page) ? src.page.join(", ") : src.page}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {finalAnswer.sources?.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No sources provided for this answer.
              </p>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};
