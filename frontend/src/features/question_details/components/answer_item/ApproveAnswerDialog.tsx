import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { Textarea } from "@/components/atoms/textarea";
import { SourceUrlManager } from "@/components/source-url-manager";
import type { SourceItem } from "@/types";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useRef } from "react";

interface ApproveAnswerDialogProps {
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editableAnswer: string;
  setEditableAnswer: (value: string) => void;
  sources: SourceItem[];
  setSources: (sources: SourceItem[]) => void;
  isUpdatingAnswer: boolean;
  handleUpdateAnswer: () => void;
  lastReroutedTo: any;
  approvalCount: number;
  questionStatus?: string;
  paeReview?: boolean;
}

export const ApproveAnswerDialog = ({
  editOpen,
  setEditOpen,
  editableAnswer,
  setEditableAnswer,
  sources,
  setSources,
  isUpdatingAnswer,
  handleUpdateAnswer,
  lastReroutedTo,
  approvalCount,
  questionStatus,
  paeReview,
}: ApproveAnswerDialogProps) => {
  const isPaeSubmitted = questionStatus === "pae_submitted";
  const isDisabled =
    lastReroutedTo?.status === "pending" ||
    (!isPaeSubmitted && approvalCount < 3);

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedHandleUpdateAnswer = () => {
    if (debounceRef.current) return;
    handleUpdateAnswer();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
    }, 300);
  };
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogTrigger asChild>
        <button
          disabled={isDisabled}
          className={`
             bg-primary text-primary-foreground 
                      flex items-center gap-2 
                      px-3 py-1 sm:px-4 sm:py-1
                      rounded-md
                      text-sm
                      whitespace-nowrap
                      transition-all duration-200
            ${
              isDisabled
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-primary/90 hover:shadow-md active:scale-95"
            }
          `}
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve Answer
        </button>
      </DialogTrigger>

      <DialogContent
        className="w-[90vw] max-w-6xl max-h-[85vh] flex flex-col"
        style={{ maxWidth: "70vw" }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            Approve Answer
            {paeReview && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                PAE Submitted
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2">
          <div className="mt-4">
            <Textarea
              value={editableAnswer}
              placeholder="Update answer here..."
              onChange={(e) => setEditableAnswer(e.target.value)}
              className="min-h-[150px] max-h-[300px] resize-none border border-border bg-background overflow-y-auto"
            />
            <SourceUrlManager
              sources={sources}
              onSourcesChange={setSources}
              className="py-3"
            />
          </div>

          <div
            className="mt-4 p-4 rounded-md border bg-yellow-50 border-yellow-300 text-yellow-900 text-sm
            dark:bg-yellow-900/20 dark:border-yellow-700/60 dark:text-yellow-200"
          >
            ⚠️ You are about to approve a <strong>answer</strong>. Please review
            your changes carefully before saving to avoid mistakes.
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 flex-shrink-0">
          {isUpdatingAnswer ? (
            // Alert div shown while updating
            <div className="w-full bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-md flex items-center justify-center gap-2 text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              Approving the answer...
            </div>
          ) : (
            // Buttons shown when NOT updating
            <>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={debouncedHandleUpdateAnswer}
                className="bg-primary text-primary-foreground flex items-center gap-2"
              >
                Save & finalize
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
