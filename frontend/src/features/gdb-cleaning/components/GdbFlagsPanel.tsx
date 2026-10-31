import { useState } from "react";
import { Badge } from "@/components/atoms/badge";
import { Button } from "@/components/atoms/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/atoms/collapsible";
import { Textarea } from "@/components/atoms/textarea";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  MinusCircle,
  XCircle,
} from "lucide-react";
import { effectiveResult } from "../types";
import type { GdbCheckResult, IGdbCheck } from "../types";
import { humanize } from "../utils";

const CATEGORY_LABELS: Record<string, string> = {
  chemical: "Chemicals",
  source: "Sources",
  answer_quality: "Answer quality",
  terminology: "Terminology",
};

const PILL_CLASSES: Record<GdbCheckResult, string> = {
  PASS: "bg-green-100 text-green-700 border-green-700 dark:bg-green-900/30 dark:text-green-300",
  FAIL: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700",
  NOT_EVALUATED:
    "bg-amber-50 text-amber-700 border-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  NOT_APPLICABLE: "bg-muted text-muted-foreground border-border",
};

const LABELS: Record<GdbCheckResult, string> = {
  PASS: "Passed",
  FAIL: "Flagged",
  NOT_EVALUATED: "Could not run",
  NOT_APPLICABLE: "Not applicable",
};

const ResultIcon = ({ result }: { result: GdbCheckResult }) => {
  const className = "w-3.5 h-3.5 mr-1 flex-shrink-0";
  if (result === "PASS") return <CheckCircle2 className={className} />;
  if (result === "FAIL") return <XCircle className={className} />;
  if (result === "NOT_EVALUATED") return <AlertTriangle className={className} />;
  return <MinusCircle className={className} />;
};

interface GdbFlagsPanelProps {
  checks: IGdbCheck[];
  // an expert can change a flag only while the answer is still to do
  editable?: boolean;
  busy?: boolean;
  // resolves once the change is saved
  onEditFlag?: (parameter: string, result: "PASS" | "FAIL", comment: string) => Promise<unknown>;
}

// the small form that asks why a flag is being changed
const CommentForm = ({
  prompt,
  busy,
  onSave,
  onCancel,
}: {
  prompt: string;
  busy: boolean;
  onSave: (comment: string) => Promise<unknown>;
  onCancel: () => void;
}) => {
  const [comment, setComment] = useState("");
  return (
    <div className="mt-2 space-y-2">
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={prompt}
        className="min-h-[60px] text-sm"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!comment.trim() || busy}
          onClick={async () => {
            try {
              await onSave(comment.trim());
              onCancel();
            } catch {
              // the error is shown by the save itself, the text stays in the box
            }
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

export const GdbFlagsPanel = ({ checks, editable = false, busy = false, onEditFlag }: GdbFlagsPanelProps) => {
  // the check being changed, and to what
  const [changing, setChanging] = useState<{ parameter: string; result: "PASS" | "FAIL" } | null>(null);
  const canEdit = editable && Boolean(onEditFlag);

  const flagged = checks.filter((check) => effectiveResult(check) === "FAIL");
  const notRun = checks.filter((check) => effectiveResult(check) === "NOT_EVALUATED");

  const groups = checks.reduce<Record<string, IGdbCheck[]>>((acc, check) => {
    (acc[check.category] ||= []).push(check);
    return acc;
  }, {});

  const form = (check: IGdbCheck, result: "PASS" | "FAIL") =>
    changing?.parameter === check.parameter && changing.result === result ? (
      <CommentForm
        prompt={result === "PASS" ? "Why is this not a problem? (required)" : "Why is this a problem? (required)"}
        busy={busy}
        onSave={(comment) => onEditFlag!(check.parameter, result, comment)}
        onCancel={() => setChanging(null)}
      />
    ) : null;

  return (
    <div>
      <p className="text-sm font-medium text-foreground mb-3">Flags</p>
      <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={`${PILL_CLASSES[flagged.length ? "FAIL" : "PASS"]} rounded-full`}>
            {flagged.length
              ? `${flagged.length} ${flagged.length === 1 ? "flag" : "flags"}`
              : "No flags"}
          </Badge>
          {notRun.length > 0 && (
            <Badge className={`${PILL_CLASSES.NOT_EVALUATED} rounded-full`}>
              {notRun.length} could not run
            </Badge>
          )}
        </div>

        {flagged.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-3">
            <ul className="space-y-3 text-sm text-foreground">
              {flagged.map((check) => (
                <li key={check.parameter}>
                  <span className="font-semibold text-red-800 dark:text-red-300">
                    {humanize(check.parameter)}
                  </span>
                  <span className="text-muted-foreground">
                    : {check.override ? `Added by an expert. ${check.override.comment}` : check.reason}
                  </span>
                  {canEdit && (
                    <div className="mt-1">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setChanging({ parameter: check.parameter, result: "PASS" })}
                      >
                        {check.override ? "Undo my change" : "Not a problem"}
                      </Button>
                    </div>
                  )}
                  {form(check, "PASS")}
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.entries(groups).map(([category, items]) => (
          <div key={category}>
            <p className="text-sm text-muted-foreground mb-2">
              {CATEGORY_LABELS[category] ?? humanize(category)}
            </p>
            <div className="flex flex-wrap gap-2">
              {items.map((check) => {
                const result = effectiveResult(check);
                return (
                  <Badge
                    key={check.parameter}
                    title={LABELS[result]}
                    className={`${PILL_CLASSES[result]} rounded-full`}
                  >
                    <ResultIcon result={result} />
                    {humanize(check.parameter)}
                  </Badge>
                );
              })}
            </div>
          </div>
        ))}

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-foreground">
            View check details
            <ChevronDown className="w-4 h-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2">
            {checks.map((check) => {
              const result = effectiveResult(check);
              return (
                <div key={check.parameter} className="rounded-md border bg-background p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-foreground">{humanize(check.parameter)}</span>
                    <Badge className={`${PILL_CLASSES[result]} rounded-full`}>
                      <ResultIcon result={result} />
                      {LABELS[result]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground mt-1 break-words">{check.reason}</p>
                  {check.override && (
                    <p className="mt-1 text-xs text-foreground break-words">
                      <span className="font-semibold">Changed by an expert</span> (the system found{" "}
                      {LABELS[check.result].toLowerCase()}): {check.override.comment}
                    </p>
                  )}
                  {canEdit && result !== "FAIL" && (
                    <Button
                      className="mt-2"
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setChanging({ parameter: check.parameter, result: "FAIL" })}
                    >
                      {check.override ? "Undo my change" : "Mark as a problem"}
                    </Button>
                  )}
                  {form(check, "FAIL")}
                </div>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};
