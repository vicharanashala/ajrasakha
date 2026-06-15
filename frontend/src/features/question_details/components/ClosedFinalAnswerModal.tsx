import { useState } from "react";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/atoms/alert-dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import { Textarea } from "@/components/atoms/textarea";
import { SourceUrlManager } from "@/components/source-url-manager";
import type { IQuestionFullData, SourceItem } from "@/types";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Pencil,
  X,
  Save,
  Loader2,
} from "lucide-react";
import { toast } from "@/shared/components/toast";

interface ClosedFinalAnswerModalProps {
  question: IQuestionFullData;
}

export const ClosedFinalAnswerModal = ({
  question,
}: ClosedFinalAnswerModalProps) => {
  const finalAnswer = question.closedFinalAnswer;

  const [open, setOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [editedAnswer, setEditedAnswer] = useState(finalAnswer?.answer ?? "");
  const [editedSources, setEditedSources] = useState<SourceItem[]>(
    finalAnswer?.sources ?? []
  );

  const { mutateAsync: updateAnswer, isPending: isSaving } = useUpdateAnswer();

  if (!finalAnswer) return null;

  const handleEditToggle = () => {
    // Reset to latest saved values when opening edit mode
    setEditedAnswer(finalAnswer.answer ?? "");
    setEditedSources(finalAnswer.sources ?? []);
    setIsEditing(true);
  };

  const handleCancel = () => {
    setEditedAnswer(finalAnswer.answer ?? "");
    setEditedSources(finalAnswer.sources ?? []);
    setIsEditing(false);
  };

  const handleSaveRequest = () => {
    if (!editedAnswer.trim()) {
      toast.error("Answer cannot be empty.");
      return;
    }
    setShowConfirm(true);
  };

  const handleConfirmedSave = async () => {
    let toastId;
    setShowConfirm(false);
    try {
      toastId = toast.loading('updating answer...')
      await updateAnswer({
        answerId: finalAnswer._id,
        questionId: question._id,
        updatedAnswer: editedAnswer.trim(),
        sources:
          editedSources.length > 0
            ? editedSources
            : [
                {
                  sourceType: "MODERATOR_REVIEW",
                  source: "Answer reviewed and approved by moderator",
                },
              ],
        source: question.source,
        isModeratorApproval: false,
      });
      toast.dismiss(toastId)
      toast.success("Final answer updated successfully.");
      setIsEditing(false);
    } catch (err: any) {
      toast.dismiss(toastId)
      toast.error(err?.message ?? "Failed to update the answer. Please try again.");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          // Reset edit state when dialog is closed
          setIsEditing(false);
          setEditedAnswer(finalAnswer.answer ?? "");
          setEditedSources(finalAnswer.sources ?? []);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <BookOpen className="w-4 h-4" />
          View and Edit Final Answer
        </Button>
      </DialogTrigger>

      <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-3xl h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
              <div className="p-2 rounded-lg bg-green-500/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-green-600" />
              </div>
              Final Answer
            </DialogTitle>

            {/* Edit / Cancel buttons in header */}
            {!isEditing ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleEditToggle}
                className="gap-2 mr-8"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="gap-2 mr-8 text-muted-foreground"
                disabled={isSaving}
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </Button>
            )}
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-hidden mt-2 pr-2">
          <div className="space-y-6">
            {/* ── Answer section ── */}
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-muted-foreground mb-2 uppercase tracking-wide">
                Answer
              </p>

              {isEditing ? (
                <Textarea
                  value={editedAnswer}
                  onChange={(e) => setEditedAnswer(e.target.value)}
                  className="min-h-[180px] resize-none border border-border bg-background text-sm"
                  placeholder="Edit the final answer..."
                />
              ) : (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {finalAnswer.answer}
                </p>
              )}
            </div>

            {/* ── Sources section ── */}
            {isEditing ? (
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <SourceUrlManager
                  sources={editedSources}
                  onSourcesChange={setEditedSources}
                />
              </div>
            ) : (
              <>
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
                            {src.page != null && (
                              <span className="text-xs text-muted-foreground">
                                Page {src.page}
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
              </>
            )}
          </div>
        </ScrollArea>

        {/* ── Footer Save button (only in edit mode) ── */}
        {isEditing && (
          <div className="flex-shrink-0 border-t border-border pt-4 flex items-center justify-end gap-3">
            {/* <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={isSaving}
              className="gap-2"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </Button> */}
            <Button
              type="button"
              size="sm"
              onClick={handleSaveRequest}
              disabled={isSaving || !editedAnswer.trim()}
              className="gap-2 bg-primary text-primary-foreground hover:opacity-90"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        )}

        {/* Confirmation AlertDialog — rendered outside isEditing block, controlled by showConfirm */}
        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save changes to the final answer?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to save these changes? This will update the final answer and its sources for this question.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>Go back</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleConfirmedSave}
                disabled={isSaving}
                className="bg-primary text-primary-foreground hover:opacity-90"
              >
                {isSaving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                  </span>
                ) : (
                  "Yes, save changes"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};
