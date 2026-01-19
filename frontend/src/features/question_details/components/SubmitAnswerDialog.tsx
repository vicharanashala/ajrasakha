import { Button } from "@/components/atoms/button";

import { Textarea } from "@/components/atoms/textarea";
import { SourceUrlManager } from "@/components/source-url-manager";
import { useSubmitAnswer } from "@/hooks/api/answer/useSubmitAnswer";
import type { SourceItem } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogHeader,
} from "@/components/atoms/dialog";
import { Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface SubmitAnswerDialogProps {
  questionId: string;
  isAlreadySubmitted: boolean;
  currentUserId: string;
  onSubmitted?: () => void;
}
export const SubmitAnswerDialog = ({
  questionId,
  isAlreadySubmitted,
  onSubmitted,
}: SubmitAnswerDialogProps) => {
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceItem[]>([]);
  const { mutateAsync: submitAnswer, isPending: isSubmittingAnswer } =
    useSubmitAnswer();

  const triggerLabel = isAlreadySubmitted
    ? "Already submitted"
    : "Submit answer";

  async function handleSubmit() {
    if (!answer.trim()) {
      toast.error("Please write your answer before submitting.");
      return;
    }
    if (!sources.length) {
      toast.error("Atleast one source is required!");
      return;
    }
    try {
      const result = await submitAnswer({
        questionId: questionId,
        answer,
        sources,
      });
      if (result) {
        toast.success(
          result.isFinalAnswer
            ? "Response submitted successfully! ✅ This is the final answer."
            : "Response submitted successfully!"
        );
      }
      onSubmitted?.();
      setOpen(false);
      setAnswer("");
    } catch (e: any) {
      toast.error("Failed to submit");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default" disabled={isAlreadySubmitted}>
          <Send className="w-3 h-3" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isAlreadySubmitted ? "Submit a new answer" : "Submit your answer"}
          </DialogTitle>
          <DialogDescription>
            {isAlreadySubmitted
              ? "You have already submitted an answer. Submitting again will create a new iteration."
              : "Provide your answer below to submit."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Answer textarea */}
          <div className="grid gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="answer">
              Your answer
            </label>
            <Textarea
              id="answer"
              placeholder="Write your answer..."
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              className="w-full border rounded p-2 text-sm resize-none overflow-y-auto h-24 not-first:max-h-36"
              rows={6}
            />
          </div>

          <div className="bg-card border border-border rounded-xl p-6 shadow-sm mt-3 md:mt-6">
            <SourceUrlManager sources={sources} onSourcesChange={setSources} />

            {sources.length > 0 && (
              <div className="mt-6 pt-6 border-t border-border">
                <p className="text-sm text-muted-foreground">
                  {sources.length} {sources.length === 1 ? "source" : "sources"}{" "}
                  added
                </p>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="secondary"
            onClick={() => setOpen(false)}
            disabled={isSubmittingAnswer}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmittingAnswer}>
            {isSubmittingAnswer ? "Submitting..." : triggerLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
