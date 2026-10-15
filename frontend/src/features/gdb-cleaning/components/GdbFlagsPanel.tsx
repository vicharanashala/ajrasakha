import { Badge } from "@/components/atoms/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/atoms/collapsible";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  MinusCircle,
  XCircle,
} from "lucide-react";
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

export const GdbFlagsPanel = ({ checks }: { checks: IGdbCheck[] }) => {
  const flagged = checks.filter((check) => check.result === "FAIL");
  const notRun = checks.filter((check) => check.result === "NOT_EVALUATED");

  const groups = checks.reduce<Record<string, IGdbCheck[]>>((acc, check) => {
    (acc[check.category] ||= []).push(check);
    return acc;
  }, {});

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
            <ul className="space-y-2 text-sm text-foreground">
              {flagged.map((check) => (
                <li key={check.parameter}>
                  <span className="font-semibold text-red-800 dark:text-red-300">
                    {humanize(check.parameter)}
                  </span>
                  <span className="text-muted-foreground">: {check.reason}</span>
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
              {items.map((check) => (
                <Badge
                  key={check.parameter}
                  title={LABELS[check.result]}
                  className={`${PILL_CLASSES[check.result]} rounded-full`}
                >
                  <ResultIcon result={check.result} />
                  {humanize(check.parameter)}
                </Badge>
              ))}
            </div>
          </div>
        ))}

        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-foreground">
            View check details
            <ChevronDown className="w-4 h-4" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-3 space-y-2">
            {checks.map((check) => (
              <div key={check.parameter} className="rounded-md border bg-background p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground">{humanize(check.parameter)}</span>
                  <Badge className={`${PILL_CLASSES[check.result]} rounded-full`}>
                    <ResultIcon result={check.result} />
                    {LABELS[check.result]}
                  </Badge>
                </div>
                <p className="text-muted-foreground mt-1 break-words">{check.reason}</p>
              </div>
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};
