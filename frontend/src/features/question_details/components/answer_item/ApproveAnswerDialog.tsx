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
import { CheckCircle2, Loader2, Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const APPROVE_ANSWER_DRAFTS_KEY = "approveAnswerDrafts";

type ApproveAnswerDraft = {
  answer: string;
  sources: SourceItem[];
};

export const getApproveAnswerDrafts = (): Record<string, ApproveAnswerDraft> => {
  try {
    const saved = localStorage.getItem(APPROVE_ANSWER_DRAFTS_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
};

export const clearApproveAnswerDraft = (questionId: string) => {
  if (!questionId) return;

  try {
    const drafts = getApproveAnswerDrafts();
    delete drafts[questionId];
    localStorage.setItem(APPROVE_ANSWER_DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Ignore localStorage failures; saving the answer should not be blocked.
  }
};

const focusTextareaAtEnd = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.focus();
  const len = el.value.length;
  el.setSelectionRange(len, len);
  // Scroll to bottom so the cursor is visually in view for long answers.
  el.scrollTop = el.scrollHeight;
};

type DialogMode = "approve" | "edit";

interface ApproveAnswerDialogProps {
  questionId: string;
  editOpen: boolean;
  setEditOpen: (open: boolean) => void;
  editableAnswer: string;
  setEditableAnswer: (value: string) => void;
  sources: SourceItem[];
  setSources: (sources: SourceItem[]) => void;
  isUpdatingAnswer: boolean;
  handleUpdateAnswer: () => void;
  lastReroutedTo?: any;
  approvalCount?: number;
  questionStatus?: string;
  paeReview?: boolean;
  mode?: DialogMode;
  isStaticDynamic?: boolean;
}

export const ApproveAnswerDialog = ({
  questionId,
  editOpen,
  setEditOpen,
  editableAnswer,
  setEditableAnswer,
  sources,
  setSources,
  isUpdatingAnswer,
  handleUpdateAnswer,
  lastReroutedTo,
  approvalCount = 0,
  questionStatus,
  paeReview,
  mode = "approve",
  isStaticDynamic = false,
}: ApproveAnswerDialogProps) => {
  const isEdit = mode === "edit";
  const isPaeSubmitted = questionStatus === "pae_submitted";
  const isDisabled =
    !isEdit &&
    (lastReroutedTo?.status === "pending" ||
      (!isPaeSubmitted && approvalCount < 3));

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [hasHydratedDraft, setHasHydratedDraft] = useState(false);

  useEffect(() => {
    if (!editOpen || !questionId) {
      setHasHydratedDraft(false);
      return;
    }

    const draft = getApproveAnswerDrafts()[questionId];
    if (draft) {
      setEditableAnswer(draft.answer);
      setSources(draft.sources);
    }

    setHasHydratedDraft(true);
  }, [editOpen, questionId, setEditableAnswer, setSources]);

  useEffect(() => {
    if (!editOpen || !questionId || !hasHydratedDraft) return;

    const drafts = getApproveAnswerDrafts();
    const existing = drafts[questionId];

    if (
      existing &&
      existing.answer === editableAnswer &&
      JSON.stringify(existing.sources) === JSON.stringify(sources)
    ) {
      return;
    }

    localStorage.setItem(
      APPROVE_ANSWER_DRAFTS_KEY,
      JSON.stringify({
        ...drafts,
        [questionId]: {
          answer: editableAnswer,
          sources,
        },
      })
    );
  }, [editableAnswer, sources, editOpen, questionId, hasHydratedDraft]);

  const debouncedHandleUpdateAnswer = () => {
    if (debounceRef.current) return;
    handleUpdateAnswer();
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
    }, 300);
  };

  const copy = isEdit
    ? {
        title: "Edit Final Answer",
        placeholder: "Update the final answer here...",
        warning: (
          <>
            ⚠️ You are about to edit a <strong>finalized answer</strong>. Please
            review your changes carefully before saving.
          </>
        ),
        loading: "Updating the final answer...",
        save: "Save changes",
      }
    : {
        title: "Approve Answer",
        placeholder: "Update answer here...",
        warning: (
          <>
            ⚠️ You are about to approve a <strong>answer</strong>. Please review
            your changes carefully before saving to avoid mistakes.
          </>
        ),
        loading: "Approving the answer...",
        save: "Save & finalize",
      };

  return (
    <Dialog open={editOpen} onOpenChange={setEditOpen}>
      <DialogTrigger asChild>
        {isEdit ? (
          <button
            type="button"
            className="bg-green-600 text-white
                       flex items-center gap-2
                       px-3 py-1 sm:px-4 sm:py-1
                       rounded-md
                       text-sm
                       whitespace-nowrap
                       transition-all duration-200
                       hover:bg-green-700 hover:shadow-md active:scale-95
                       dark:bg-green-700 dark:hover:bg-green-600"
            title="Edit final answer"
          >
            <Pencil className="h-4 w-4" />
            Edit Final Answer
          </button>
        ) : (
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
            {isStaticDynamic ? "Notify User" : "Approve Answer"}
          </button>
        )}
      </DialogTrigger>

      <DialogContent
        className="z-[200] w-[90vw] max-w-6xl max-h-[85vh] flex flex-col"
        style={{ maxWidth: "70vw" }}
        onOpenAutoFocus={(e) => {
          // Skip Radix's default focus-first-element behaviour and place the
          // caret at the end of the existing answer instead.
          e.preventDefault();
          requestAnimationFrame(() => focusTextareaAtEnd(textareaRef.current));
        }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            {copy.title}
            {!isEdit && paeReview && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                PAE Submitted
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2">
          <div className="mt-4">
            <Textarea
              ref={textareaRef}
              value={editableAnswer}
              placeholder={copy.placeholder}
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
            {copy.warning}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 flex-shrink-0">
          {isUpdatingAnswer ? (
            <div className="w-full bg-blue-50 text-blue-600 border border-blue-200 px-4 py-2 rounded-md flex items-center justify-center gap-2 text-sm font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              {copy.loading}
            </div>
          ) : (
            <>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={debouncedHandleUpdateAnswer}
                className="bg-primary text-primary-foreground flex items-center gap-2"
              >
                {copy.save}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
