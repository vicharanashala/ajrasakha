import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
  QuestionRerouteRepo
} from "@/types";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { SourceUrlManager } from "../../components/source-url-manager";
import { ConfirmationModal } from "../../components/confirmation-modal";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/atoms/dialog";
import { Button } from "../../components/atoms/button";
import { Label } from "../../components/atoms/label";
import { Textarea } from "../../components/atoms/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/atoms/card";
import {
  CheckCircle,
  RefreshCw,
  RotateCcw,
  MessageCircle,
  Info,
  Loader2,
  Send,
  
  FileText,
 
  Pencil,
  
  ArrowRight
} from "lucide-react";
import { ReviewChecklist } from "./ReviewChecklist";


interface ReviewResponseDialogProps {
  isOpen: boolean;
  onOpenChange: (value: boolean) => void;
  type: "reject" | "modify";
  title: string;
  icon?: React.ReactNode;
  reasonLabel?: string;
  submitReasonText?: string;
  checklist: IReviewParmeters;
  onChecklistChange: (value: IReviewParmeters) => void;
  rejectionReason: string;
  setRejectionReason: (val: string) => void;
  isStageSubmitted: boolean;
  setIsStageSubmitted: (val: boolean) => void;
  newAnswer: string;
  setNewAnswer: (val: string) => void;
  selectedQuestionData: any;
  isSubmitting: boolean;
  handleSubmit: (type: "reject" | "modify") => void;
  handleReset: () => void;
  isFinalAnswer?: boolean;
  sources: SourceItem[];
  setSources: (value: SourceItem[]) => void;
  confirmOpen: boolean;
  setConfirmOpen: (value: boolean) => void;
  remarks: string;
  setRemarks: (value: string) => void;
}

export const ReviewResponseDialog = (props: ReviewResponseDialogProps) => {
  const {
    isOpen,
    onOpenChange,
    type,
    title,
    icon,
    reasonLabel = "Reason",
    submitReasonText = "Continue",
    checklist,
    onChecklistChange,
    rejectionReason,
    setRejectionReason,
    isStageSubmitted,
    setIsStageSubmitted,
    newAnswer,
    setNewAnswer,
    selectedQuestionData,
    isSubmitting,
    handleSubmit,
    handleReset,
    isFinalAnswer,
    sources,
    setSources,
    confirmOpen,
    setConfirmOpen,
    remarks,
    setRemarks,
  } = props;
  const [tempRejectAnswer, setTempRejectAnswer] = useState("");
  const [tempSources, setTempSources] = useState<SourceItem[]>([]);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen)
      if (type === "modify") {
        setTempRejectAnswer(newAnswer);
        setTempSources(sources);
        onChecklistChange({
          ...checklist,
          valueInsight: true,
        });
      } else {
        onChecklistChange({
          contextRelevance: false,
          credibilityTrust: false,
          practicalUtility: false,
          readabilityCommunication: false,
          technicalAccuracy: false,
          valueInsight: false,
        });
        setTempRejectAnswer("");
        setTempSources([]);
      }
  }, [isOpen, type]);

  useEffect(() => {
    const msg = getReviewSuggestion(checklist);
    setSuggestion(msg);
  }, [checklist]);

  const getReviewSuggestion = (checklist: IReviewParmeters) => {
    const {
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
      valueInsight,
    } = checklist;

    const disabledCount = [
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
    ].filter((v) => !v).length;

    if (!valueInsight && type === "modify") {
      return "To proceed with modifications, please enable Value & Insight.";
    }

    if (valueInsight && type === "reject") {
      return "To reject this answer, please disable Value & Insight.";
    }

    if (disabledCount <= 0) {
      return "All review parameters look good. You can safely accept this answer.";
    }

    return null;
  };

  const handleResetParameters = () => {
    onChecklistChange({
      contextRelevance: false,
      credibilityTrust: false,
      practicalUtility: false,
      readabilityCommunication: false,
      technicalAccuracy: false,
      valueInsight: type == "modify" ? true : false,
    });
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(state) => {
        onOpenChange(state);
        if (!state) {
          setRejectionReason("");
          setIsStageSubmitted(false);
        }
      }}
    >
      <DialogContent
        className="max-w-4xl min-h-[70vh] max-h-[90vh] overflow-y-auto"
        style={{ minWidth: "100vh" }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="p-2 rounded-lg">{icon}</div>
            {title}
          </DialogTitle>
        </DialogHeader>

        {/* ------- STEP 1 ------- */}
        {!isStageSubmitted && (
          <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Checklist */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  Review Parameters
                </h2>

                <Button
                  variant="outline"
                  onClick={handleResetParameters}
                  disabled={isSubmitting}
                  className="flex items-center gap-1"
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset
                </Button>
              </div>

              <div className="p-4 rounded-xl border bg-card shadow-sm">
                <ReviewChecklist
                  value={checklist}
                  onChange={onChecklistChange}
                />
              </div>

              {/* Reason Box */}
              <div className="space-y-2">
                <Label htmlFor="reason" className="text-base font-semibold">
                  {reasonLabel} *
                </Label>

                <Textarea
                  id="reason"
                  placeholder={
                    type === "modify"
                      ? "Describe the reason to proceed with modification…"
                      : "Please explain why this response should be rejected…"
                  }
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="min-h-[20vh] max-h-[55vh] w-full border bg-card p-4 rounded-xl"
                />
              </div>
            </div>
            {suggestion && (
              <div className="mt-2 p-3 rounded-md bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm border border-yellow-300 dark:border-yellow-700">
                {suggestion}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  setRejectionReason("");
                  setIsStageSubmitted(false);
                }}
              >
                Cancel
              </Button>

              <Button
                variant={type === "modify" ? "default" : "destructive"}
                onClick={() => setIsStageSubmitted(true)}
                disabled={!rejectionReason.trim() || !!suggestion}
                className="group flex items-center justify-center gap-2 transition-all duration-200 hover:opacity-90 hover:scale-[1.02]"
              >
                {submitReasonText}
                <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1" />
              </Button>
            </div>
          </div>
        )}

        {isStageSubmitted && rejectionReason && (
          <div className="h-fit flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-400">
            <Card className="border flex-1 flex flex-col">
              <CardContent className="p-6 space-y-4 flex-1 overflow-y-auto">
                {/* Title */}
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  <h3 className="text-lg font-semibold">
                    Submit {type == "modify" ? "Updated " : "New "}
                    Response
                  </h3>
                </div>

                <div className="flex flex-col">
                  <Label className="text-sm text-muted-foreground mb-1">
                    Current Query:
                  </Label>
                  <p className="text-sm p-3 rounded-md border bg-muted/50">
                    {selectedQuestionData.text}
                  </p>
                </div>

                {/* <div>
                  <Label htmlFor="new-answer" className="text-sm font-medium">
                    {type == "modify" && "Draft"} Response *
                  </Label>
                  <Textarea
                    id="new-answer"
                    placeholder="Enter your Response..."
                    value={tempRejectAnswer}
                    onChange={(e) => {
                      setTempRejectAnswer(e.target.value);
                      setNewAnswer(e.target.value);
                    }}
                    className="mt-1 min-h-[100px] p-3 rounded-md"
                  />
                  <div className="border rounded-xl p-6 shadow-sm mt-3 bg-muted/20">
                    <SourceUrlManager
                      sources={tempSources}
                      onSourcesChange={(updated) => {
                        setTempSources(updated);
                        setSources(updated);
                      }}
                    />
                  </div>

                  {isFinalAnswer && (
                    <p className="mt-2 flex items-center gap-2 text-green-600 text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Final answer selected!
                    </p>
                  )}
                </div> */}

                <div>
                  <Label htmlFor="new-answer" className="text-sm font-medium">
                    {type == "modify" && "Draft"} Response *
                  </Label>

                  <Textarea
                    id="new-answer"
                    placeholder="Enter your Response..."
                    value={tempRejectAnswer}
                    onChange={(e) => {
                      setTempRejectAnswer(e.target.value);
                      setNewAnswer(e.target.value);
                    }}
                    className="mt-1 min-h-[100px] p-3 rounded-md"
                  />

                  {type == "reject" && (
                    <div className="mt-3">
                      <Label htmlFor="remarks" className="text-sm font-medium">
                        Remarks
                      </Label>
                      <Textarea
                        id="remarks"
                        placeholder="Enter remarks..."
                        value={remarks}
                        onChange={(e) => setRemarks(e.target.value)}
                        className="mt-1 md:max-h-[190px] max-h-[170px] min-h-[80px] resize-y border border-gray-200 dark:border-gray-600 text-sm md:text-md rounded-md overflow-y-auto p-3 pb-0 bg-transparent"
                      />
                    </div>
                  )}

                  {/* Sources */}
                  <div className="border rounded-xl p-6 shadow-sm mt-3 bg-muted/20">
                    <SourceUrlManager
                      sources={tempSources}
                      onSourcesChange={(updated) => {
                        setTempSources(updated);
                        setSources(updated);
                      }}
                    />
                  </div>

                  {isFinalAnswer && (
                    <p className="mt-2 flex items-center gap-2 text-green-600 text-sm font-medium">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Final answer selected!
                    </p>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4">
                  <div className="flex items-center space-x-3">
                    <ConfirmationModal
                      title={`Confirm ${
                        type == "modify" ? "Modification" : "Rejection"
                      }`}
                      description="Please review your answer carefully before proceeding. The submitted response will be evaluated by the next reviewer in the workflow."
                      confirmText="Submit"
                      cancelText="Cancel"
                      isLoading={isSubmitting}
                      open={confirmOpen}
                      onOpenChange={setConfirmOpen}
                      onConfirm={() => handleSubmit(type)}
                      trigger={
                        <Button
                          disabled={!newAnswer.trim() || isSubmitting}
                          className="flex items-center gap-2"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Submitting…
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4" />
                              Submit
                            </>
                          )}
                        </Button>
                      }
                    />

                    <Button variant="secondary" onClick={handleReset}>
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>

                  <Button
                    variant="ghost"
                    onClick={() => setIsStageSubmitted(false)}
                    disabled={!isStageSubmitted}
                    className="flex items-center gap-2 text-muted-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                    Edit Reason
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};