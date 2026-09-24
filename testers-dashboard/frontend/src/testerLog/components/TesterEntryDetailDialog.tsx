import type { ReactNode } from "react";
import { CalendarDays, Eye, Hash, User } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import type { ITesterLogEntry } from "../types";
import { ENTRY_DETAIL_GROUPS } from "../entryDetailFields";
import { formatDateTimeIST } from "../utils/formatIST";
import {
    OUTCOME_BADGE_CLASS,
    outcomeTone,
    severityBadgeClass,
    statusBadgeClass,
} from "../utils/badgeClasses";

interface TesterEntryDetailDialogProps {
    entry: ITesterLogEntry;
}

type EntryKey = keyof ITesterLogEntry;

// Fields answered from one of the form's fixed option lists - their value is
// an outcome (Yes/No, Saved/Not Saved, Within SLA/SLA Breached, ...) and gets
// a coloured badge. Left out as plain text:
// - Allocated to Reviewer?: Yes/No there is a workflow fact, not a pass or a
//   problem.
// - 120-min Msg Shown to User?: whether Yes is good depends on the question
//   type (on a GDB question it means a retrieval failure, elsewhere it can be
//   normal), so any single colour would mislead.
const OUTCOME_KEYS = new Set<EntryKey>([
    "slaStatus",
    "questionInReviewModel",
    "questionCorrectlyFramed",
    "translationQuality",
    "followUpQInReviewModel",
    "answerScientificallyCorrect",
    "expertNameDisplayed",
    "correctExpertNameDisplayed",
    "correctSourceLinksProvided",
    "notificationReceived",
    "notificationOnSameThread",
    "notificationLinkedCorrectQId",
    "voiceInputWorking",
    "voiceOutputWorking",
    "voiceInputQuality",
    "voiceOutputQuality",
    "weatherQAnsweredCorrectly",
    "mandiPriceQCorrect",
    "schemeQCorrect",
    "questionSavedInDb",
    "answerSavedInDb",
    "qIdConsistentAcrossSystems",
    "whatsappVsWebAnswerMatch",
    "status",
]);

// Free-text fields that are only filled in when something went wrong.
const PROBLEM_TEXT_KEYS = new Set<EntryKey>(["translationErrorType", "voiceIssueDescription", "defectIdBugRef"]);

// Long free text gets two grid columns so it reads as a paragraph, not a
// narrow strip.
const WIDE_KEYS = new Set<EntryKey>(["queryText", "reviewerRemarks", "testerRemarks", "voiceIssueDescription"]);

const BADGE_CLASS = "inline-block max-w-full text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded";

function isNotApplicable(value: string): boolean {
    return outcomeTone(value) === "notApplicable";
}

// Renders a field's value and says whether it flags a problem, so the tile
// around it can be tinted red too.
function renderValue(key: EntryKey, value: string | undefined): { node: ReactNode; isProblem: boolean } {
    if (!value) {
        return { node: <span className="text-muted-foreground/40">—</span>, isProblem: false };
    }
    if (key === "overallTestStatus") {
        return {
            node: <span className={`${BADGE_CLASS} ${statusBadgeClass(value)}`}>{value}</span>,
            isProblem: value.trim().toLowerCase() === "fail",
        };
    }
    if (key === "defectSeverity") {
        const severity = value.trim().toLowerCase();
        return {
            node: <span className={`${BADGE_CLASS} ${severityBadgeClass(value)}`}>{value}</span>,
            isProblem: severity === "critical" || severity === "high",
        };
    }
    if (OUTCOME_KEYS.has(key)) {
        const tone = outcomeTone(value);
        if (tone) {
            return {
                node: <span className={`${BADGE_CLASS} ${OUTCOME_BADGE_CLASS[tone]}`}>{value}</span>,
                isProblem: tone === "problem",
            };
        }
    }
    if (PROBLEM_TEXT_KEYS.has(key) && !isNotApplicable(value)) {
        return { node: <span className="font-medium text-red-700">{value}</span>, isProblem: true };
    }
    if (key === "_id") {
        return { node: <span className="font-mono text-[13px]">{value}</span>, isProblem: false };
    }
    return { node: value, isProblem: false };
}

// Full-record detail view for a tester log entry - the table shows only a
// handful of columns at a glance; this lists every field, grouped and
// labelled like the submission form, with vertical scroll instead of
// horizontal so nothing gets cut off.
export function TesterEntryDetailDialog({ entry }: TesterEntryDetailDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="flex h-7 items-center gap-1 px-2 text-xs font-medium rounded-md border hover:bg-muted transition-colors whitespace-nowrap"
                >
                    <Eye className="h-3.5 w-3.5" />
                    View
                </button>
            </DialogTrigger>
            {/* sm:max-w-* (not plain max-w-*) is what lifts the width: the
                shared DialogContent caps itself with sm:max-w-lg, and
                tailwind-merge only replaces that with another sm: max-width. */}
            <DialogContent className="w-[96vw] sm:max-w-[1600px] h-[92vh] flex flex-col gap-0 p-0 overflow-hidden rounded-xl shadow-xl">
                <DialogHeader className="px-6 pt-5 pb-4 pr-12 border-b text-left gap-2">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                        <DialogTitle className="text-lg font-semibold">
                            Test Entry Details
                        </DialogTitle>
                        {/* Quick read of the outcome - the same values also
                            appear in Defects & Remarks below. */}
                        {entry.overallTestStatus && (
                            <span className={`${BADGE_CLASS} ${statusBadgeClass(entry.overallTestStatus)}`}>
                                {entry.overallTestStatus}
                            </span>
                        )}
                        {entry.defectSeverity && (
                            <span className={`${BADGE_CLASS} ${severityBadgeClass(entry.defectSeverity)}`}>
                                {entry.defectSeverity}
                            </span>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            {entry.testerName || "Unknown tester"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                            <CalendarDays className="h-3.5 w-3.5" />
                            {entry.testDate || "No date"}
                        </span>
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                            <Hash className="h-3.5 w-3.5 shrink-0" />
                            Test ID: <span className="font-mono [overflow-wrap:anywhere]">{entry._id || "—"}</span>
                        </span>
                    </div>
                </DialogHeader>

                <ScrollArea className="flex-1 min-h-0 bg-muted/20">
                    <div className="space-y-4 p-4 sm:p-6">
                        {ENTRY_DETAIL_GROUPS.map((group) => {
                            const Icon = group.icon;
                            return (
                                <section key={group.title} className="rounded-xl border bg-card shadow-xs">
                                    <h3 className="sticky top-0 z-10 flex items-center gap-2.5 rounded-t-xl border-b bg-card px-4 py-2.5 text-sm font-semibold text-foreground">
                                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
                                            <Icon className="h-4 w-4" />
                                        </span>
                                        {group.title}
                                    </h3>
                                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 p-3">
                                        {group.fields.map((field) => {
                                            const rawValue = entry[field.key] as string | undefined;
                                            const value = field.isDateTime
                                                ? formatDateTimeIST(rawValue)
                                                : rawValue;
                                            const { node, isProblem } = renderValue(field.key, value);
                                            return (
                                                <div
                                                    key={String(field.key)}
                                                    className={`min-w-0 rounded-lg border px-3 py-2 ${
                                                        WIDE_KEYS.has(field.key) ? "sm:col-span-2" : ""
                                                    } ${
                                                        isProblem
                                                            ? "border-red-200 bg-red-50/60"
                                                            : "border-muted-foreground/10 bg-muted/30"
                                                    }`}
                                                >
                                                    <dt className="text-[11px] font-medium leading-tight text-muted-foreground">
                                                        {field.label}
                                                    </dt>
                                                    <dd className="mt-1 text-sm font-medium text-foreground tabular-nums whitespace-pre-wrap [overflow-wrap:anywhere]">
                                                        {node}
                                                    </dd>
                                                </div>
                                            );
                                        })}
                                    </dl>
                                </section>
                            );
                        })}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
