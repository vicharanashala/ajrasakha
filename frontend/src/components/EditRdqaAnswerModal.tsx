import { useState, useEffect } from "react";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
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
import type { SourceItem } from "@/types";
import { useUpdateAnswer } from "@/hooks/api/answer/useUpdateAnswer";
import { toast } from "sonner";
import { format } from "date-fns";
import { BookOpen, ExternalLink, Pencil, Save, Loader2, X, Maximize2, Minimize2 } from "lucide-react";
import type { RdqaQuestion } from "@/hooks/services/questionService";

interface EditRdqaAnswerModalProps {
  question: RdqaQuestion | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const EditRdqaAnswerModal = ({
  question,
  open,
  onOpenChange,
  onSuccess,
}: EditRdqaAnswerModalProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isAnswerExpanded, setIsAnswerExpanded] = useState(false);
  const [editedAnswer, setEditedAnswer] = useState(question?.answer?.answer ?? "");
  const [editedSources, setEditedSources] = useState<SourceItem[]>(
    question?.answer?.sources ?? []
  );

  const { mutateAsync: updateAnswer, isPending: isSaving } = useUpdateAnswer();

  // Sync state when question changes
  useEffect(() => {
    if (question) {
      setEditedAnswer(question.answer?.answer ?? "");
      setEditedSources(question?.answer?.sources ?? []);
      setIsEditing(false);
      setShowConfirm(false);
    }
  }, [question]);

  const handleOpenChange = (newOpen: boolean) => {
    onOpenChange(newOpen);
  };

  const handleEditToggle = () => {
    if (question) {
      setEditedAnswer(question.answer?.answer ?? "");
      setEditedSources(question?.answer?.sources ?? []);
    }
    setIsEditing(true);
  };

  const handleCancel = () => {
    if (question) {
      setEditedAnswer(question.answer?.answer ?? "");
      setEditedSources(question.answer?.sources ?? []);
    }
    setIsEditing(false);
  };

  const handleSaveRequest = () => {
    if (!editedAnswer.trim()) {
      toast.error("Answer cannot be empty.");
      return;
    }
    const sourcesToCheck = editedSources || [];
    for (const source of sourcesToCheck) {
      if (source.sourceType && !source.sourceName?.trim()) {
        toast.error("Source name is required for all sources.");
        return;
      }
    }
    setShowConfirm(true);
  };

  const handleConfirmedSave = async () => {
    if (!question) return;
    setShowConfirm(false);
    const sourcesToSave = editedSources || [];
    try {
      await updateAnswer({
        answerId: question.answer._id,
        questionId: question.question._id,
        updatedAnswer: editedAnswer.trim(),
        sources:
          sourcesToSave.length > 0
            ? sourcesToSave
            : [{ sourceType: "MODERATOR_REVIEW", source: "Answer reviewed and approved by moderator" }],
        source: "AJRASAKHA",
        isModeratorApproval: false,
      });
      toast.success("RDQA answer corrected successfully.");
      setIsEditing(false);
      onSuccess?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update the answer.");
    }
  };

  if (!question) return null;

  const questionDetails = question.question;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Edit RDQA Answer
          </DialogTitle>
          <DialogDescription>
            Review and edit the final answer and sources for the RDQA question.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-shrink-0 p-4 bg-muted/50 rounded-lg border">
          <p className="text-xs font-medium text-muted-foreground mb-1">Question</p>
          <p className="text-sm font-medium text-foreground line-clamp-2">
            {questionDetails.question}
          </p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
            {questionDetails.details?.state && <span>State: {questionDetails.details.state}</span>}
            {questionDetails.details?.crop && <span>Crop: {questionDetails.details.crop}</span>}
            {questionDetails.closedAt && (
              <span>Closed: {format(new Date(questionDetails.closedAt), "PPp")}</span>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 flex flex-col px-1">
          <div className="space-y-6 py-2 flex-1">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-2">
                  <BookOpen className="w-4 h-4" />
                  Answer
                </label>
                {!isEditing && (
                  <Button variant="ghost" size="sm" onClick={handleEditToggle} className="gap-2 h-8">
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </Button>
                )}
              </div>

              {isEditing ? (
                <div className="relative">
                  <Textarea
                    value={editedAnswer}
                    onChange={(e) => setEditedAnswer(e.target.value)}
                    placeholder="Enter the corrected answer..."
                    rows={isAnswerExpanded ? 15 : 10}
                    className="w-full resize-none pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setIsAnswerExpanded(!isAnswerExpanded)}
                    className="absolute right-2 top-2 p-1.5 rounded-md hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    title={isAnswerExpanded ? "Collapse" : "Expand"}
                  >
                    {isAnswerExpanded ? (
                      <Minimize2 className="w-4 h-4" />
                    ) : (
                      <Maximize2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              ) : (
                <div className="rounded-lg border bg-card p-4">
                  <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {question.answer.answer}
                  </pre>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-foreground flex items-center gap-2 mb-2">
                <ExternalLink className="w-4 h-4" />
                Sources ({isEditing ? ((editedSources || [])?.length || 0) : (question?.answer?.sources?.length || 0)})
              </label>

              {isEditing ? (
                <SourceUrlManager
                  sources={editedSources || []}
                  onSourcesChange={setEditedSources}
                />
              ) : (
                <div className="rounded-lg border bg-card p-4">
                  {((question?.answer?.sources?.length ?? 0) > 0) ? (
                    <div className="space-y-3">
                      {question.answer.sources.map((src: { source?: string; sourceType?: string; page?: string | number; sourceName?: string }, idx: number) => (
                        <div
                          key={idx}
                          className="flex items-start justify-between gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-foreground break-all">{src.source || ""}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {src.sourceType && (
                                <span className="inline-block text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                  {src.sourceType}
                                </span>
                              )}
                              {src.sourceName && (
                                <span className="text-xs text-muted-foreground">{src.sourceName}</span>
                              )}
                              {src.page != null && (
                                <span className="text-xs text-muted-foreground">Page {src.page}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No sources provided.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex-shrink-0 border-t border-border pt-4 flex items-center justify-end gap-3">
          {isEditing ? (
            <>
              <Button type="button" variant="outline" size="sm" onClick={handleCancel} disabled={isSaving} className="gap-2">
                <X className="w-3.5 h-3.5" />
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveRequest}
                disabled={isSaving || !editedAnswer.trim()}
                className="gap-2 bg-primary text-primary-foreground hover:opacity-90"
              >
                {isSaving ? (
                  <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="w-3.5 h-3.5" /> Save Correction</>
                )}
              </Button>
            </>
          ) : (
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">Close</Button>
            </DialogClose>
          )}
        </div>

        <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Save correction to the RDQA answer?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to save these changes? This will update the final answer and its sources.
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
                  <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</span>
                ) : "Yes, save correction"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};