import { Button } from "@/components/atoms/button";
import {
  CheckCircle,
  Loader2,
  Wand2,
  ListChecks,
  AlertTriangle,
} from "lucide-react";
import type { PolishDraftResponse } from "@/hooks/services/answerService";

interface PolishDraftPanelProps {
  polishResult: PolishDraftResponse | null;
  isPolishing: boolean;
  canPolish: boolean;
  onPolish: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}

/**
 * "Polish draft" button + its result panel - language-polishing suggestion
 * and structural coverage check for an expert's first-time answer, before
 * it enters the review chain. Never mutates the draft itself; onAccept is
 * the only path that does, and it's always an explicit click.
 */
export const PolishDraftPanel = ({
  polishResult,
  isPolishing,
  canPolish,
  onPolish,
  onAccept,
  onDismiss,
}: PolishDraftPanelProps) => {
  return (
    <>
      <div className="mt-2 flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPolish}
          disabled={!canPolish || isPolishing}
          className="flex items-center gap-1.5"
        >
          {isPolishing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Wand2 className="w-3.5 h-3.5" />
          )}
          {isPolishing ? "Checking…" : "Polish draft"}
        </Button>
        {polishResult && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </button>
        )}
      </div>

      {polishResult && (
        <div className="mt-2 space-y-2">
          {/* Language polishing */}
          {polishResult.languagePolishing.status === "suggested" && (
            <div className="rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm">
              <p className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                <Wand2 className="w-3.5 h-3.5" /> Suggested wording
              </p>
              <p className="mt-1 whitespace-pre-wrap">
                {polishResult.languagePolishing.suggestedText}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {polishResult.languagePolishing.guardrail?.disclaimer}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" onClick={onAccept}>
                  Use this wording
                </Button>
                <Button size="sm" variant="ghost" onClick={onDismiss}>
                  Keep my original
                </Button>
              </div>
            </div>
          )}
          {polishResult.languagePolishing.status === "rejected" && (
            <div className="rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{polishResult.languagePolishing.reason}</span>
            </div>
          )}
          {polishResult.languagePolishing.status === "unavailable" && (
            <p className="text-xs text-muted-foreground">
              {polishResult.languagePolishing.reason ||
                "Language check unavailable right now."}
            </p>
          )}

          {/* Structural validation */}
          {polishResult.structuralValidation.status === "complete" && (
            <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 p-3 text-sm flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              All expected steps for this type of question are covered.
            </div>
          )}
          {(polishResult.structuralValidation.status === "incomplete" ||
            polishResult.structuralValidation.status === "partial") &&
            polishResult.structuralValidation.steps && (
              <div className="rounded-md border border-gray-200 dark:border-gray-600 p-3 text-sm">
                <p className="font-medium flex items-center gap-1.5">
                  <ListChecks className="w-3.5 h-3.5" /> Structure check
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {polishResult.structuralValidation.steps.map((step) => (
                    <li key={step.slNo} className="flex gap-2">
                      <span
                        className={
                          step.coverage === "covered"
                            ? "text-green-600"
                            : step.coverage === "partial"
                              ? "text-amber-600"
                              : "text-red-600"
                        }
                      >
                        {step.coverage === "covered"
                          ? "✓"
                          : step.coverage === "partial"
                            ? "~"
                            : "✗"}
                      </span>
                      <span>
                        <span className="font-medium">{step.step}</span>
                        {step.coverage !== "covered" && (
                          <span className="block text-xs text-muted-foreground">
                            {step.example}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          {polishResult.structuralValidation.status ===
            "needs_clarification" && (
            <p className="text-xs text-muted-foreground">
              {polishResult.structuralValidation.clarificationReason}
            </p>
          )}
          {polishResult.structuralValidation.status ===
            "reference_data_unavailable" && (
            <p className="text-xs text-muted-foreground">
              Structure check is unavailable right now.
            </p>
          )}
        </div>
      )}
    </>
  );
};
