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
}: ApproveAnswerDialogProps) => {
  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogTrigger asChild>
        <button
          disabled={lastReroutedTo?.status === "pending" || approvalCount < 3}
          className={`bg-primary text-primary-foreground flex items-center gap-2 px-2 py-2 rounded
            ${
              lastReroutedTo?.status === "pending" || approvalCount < 3
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-primary/90"
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
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            Approve Answer
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4">
          <Textarea
            value={editableAnswer}
            placeholder="Update answer here..."
            onChange={(e) => setEditableAnswer(e.target.value)}
            className="min-h-[150px] resize-none border border-border bg-background"
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

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setEditOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleUpdateAnswer}
            className="bg-primary text-primary-foreground flex items-center gap-2"
            disabled={isUpdatingAnswer}
          >
            {isUpdatingAnswer ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save & finalize"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
