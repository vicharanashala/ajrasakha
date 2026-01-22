import type {
  HistoryItem,
  IQuestion,
  IReviewParmeters,
  SourceItem,
  QuestionRerouteRepo
} from "@/types";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/atoms/button";
import {
  CheckCircle,
  RefreshCw,
  RotateCcw,
  MessageCircle,
  Info,
  Loader2,
  
 
  
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../../components/atoms/dialog";
import { ReviewChecklist } from "./ReviewChecklist";

export const AcceptReviewDialog = ({
  checklist,
  onChecklistChange,
  isSubmitting,
  onConfirm,
}: {
  checklist: IReviewParmeters;
  onChecklistChange: (value: IReviewParmeters) => void;
  isSubmitting: boolean;
  onConfirm: () => void;
}) => {
  const [open, setOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<string | null>(null);

  useEffect(() => {
    const msg = getReviewSuggestion(checklist);
    setSuggestion(msg);
  }, [checklist]);

  const handleConfirm = () => {
    // const suggestion = getReviewSuggestion(checklist);

    // if (suggestion) {
    //   toast.warning(suggestion);
    //   return; // Prevent accept
    // }

    onConfirm();
    setOpen(false);
  };

  useEffect(() => {
    onChecklistChange({
      contextRelevance: true,
      credibilityTrust: true,
      practicalUtility: true,
      readabilityCommunication: true,
      technicalAccuracy: true,
      valueInsight: true,
    });
  }, []);

  const handleReset = () => {
    const defaultChecklist: IReviewParmeters = {
      contextRelevance: true,
      credibilityTrust: true,
      practicalUtility: true,
      readabilityCommunication: true,
      technicalAccuracy: true,
      valueInsight: true,
    };

    onChecklistChange(defaultChecklist);
    setSuggestion(null);
  };

  const getReviewSuggestion = (checklist: IReviewParmeters) => {
    const {
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
      valueInsight,
    } = checklist;

    // Count disabled parameters except valueInsight
    const disabledCount = [
      contextRelevance,
      credibilityTrust,
      practicalUtility,
      readabilityCommunication,
      technicalAccuracy,
      valueInsight,
    ].filter((v) => !v).length;

    if (!disabledCount) return null;
    // if (valueInsight) {
    //   return "Consider modifying the answer instead accepting it.";
    // }

    if (disabledCount >= 1 && disabledCount <= 3) {
      return "Some criteria are unmet. Please modify/reject the answer instead accepting.";
    }

    if (disabledCount >= 3) {
      return "Multiple criteria are unmet. Consider rejecting the answer.";
    }

    return null;
  };

  return (
    <>
      <Button
        disabled={isSubmitting}
        size="sm"
        className="flex items-center gap-1 
             bg-green-500  text-white
             dark:bg-green-900 hover:bg-green-500"
        onClick={() => setOpen(true)}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Accepting...
          </>
        ) : (
          <>
            <CheckCircle className="w-4 h-4" />
            Accept
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold">
              Confirm Acceptance
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Please verify all review parameters before accepting this
              response. This action cannot be undone.
            </p>
          </DialogHeader>

          <div className="mt-4 p-4 rounded-lg border bg-card space-y-4">
            <ReviewChecklist value={checklist} onChange={onChecklistChange} />
          </div>
          {suggestion && (
            <div className="mt-2 p-3 rounded-md bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-sm border border-yellow-300 dark:border-yellow-700">
              {suggestion}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isSubmitting}
              className="flex items-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>

            <Button
              onClick={handleConfirm}
              disabled={isSubmitting || !!suggestion}
              className="flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Accepting...
                </>
              ) : (
                "Confirm Accept"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};