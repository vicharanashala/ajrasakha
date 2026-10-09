// Badge colours shared by the Tester Data table and the Test Entry Details
// dialog, so a PASS or a Critical reads the same in both places.

export function statusBadgeClass(value?: string): string {
    switch ((value || "").trim().toLowerCase()) {
        case "pass":
            return "bg-emerald-100 text-emerald-700";
        case "fail":
            return "bg-red-100 text-red-700";
        case "partial":
            return "bg-yellow-100 text-yellow-700";
        default:
            return "bg-muted text-muted-foreground";
    }
}

export function severityBadgeClass(value?: string): string {
    switch ((value || "").trim().toLowerCase()) {
        case "critical":
            return "bg-red-100 text-red-700";
        case "high":
            return "bg-orange-100 text-orange-700";
        case "medium":
            return "bg-yellow-100 text-yellow-700";
        case "low":
            return "bg-blue-100 text-blue-700";
        default:
            return "bg-muted text-muted-foreground";
    }
}

// Marks a cross-platform ("Both") entry - purple, like the form's
// Cross-Platform Parity block, and distinct from every outcome colour.
export const CROSS_PLATFORM_BADGE_CLASS = "bg-purple-100 text-purple-700";

export type OutcomeTone = "good" | "problem" | "partial" | "notApplicable";

// Tone of the form's check-style answers (see the *_OPTIONS lists in
// ../types.ts), in the same palette as statusBadgeClass: good -> emerald
// (like PASS), problem -> red (like FAIL), partial/late -> yellow (like
// PARTIAL), not applicable -> muted. Returns null for anything else (free
// text), which is shown as plain text rather than a badge.
const GOOD_VALUES = new Set([
    "pass", "yes", "within sla", "well framed", "correct", "displayed", "saved",
    "received on time", "good", "clear", "expected output", "successfully identified as duplicate",
]);
const PROBLEM_VALUES = new Set([
    "fail", "no", "sla breached", "incorrectly framed", "incorrect", "not displayed", "wrong expert",
    "not saved", "not received", "poor", "distorted", "no output", "anomaly found in output",
    "wrongly identified as duplicate",
]);
const PARTIAL_VALUES = new Set([
    "partial", "partially correct", "partial save", "ambiguous", "received late", "fair",
    "low volume", "high volume", "pending",
]);
const NOT_APPLICABLE_VALUES = new Set(["na", "not applicable", "duplicate", "nil"]);

export function outcomeTone(value?: string): OutcomeTone | null {
    const v = (value || "").trim().toLowerCase();
    if (GOOD_VALUES.has(v)) return "good";
    if (PROBLEM_VALUES.has(v)) return "problem";
    if (PARTIAL_VALUES.has(v)) return "partial";
    if (NOT_APPLICABLE_VALUES.has(v)) return "notApplicable";
    return null;
}

export const OUTCOME_BADGE_CLASS: Record<OutcomeTone, string> = {
    good: "bg-emerald-100 text-emerald-700",
    problem: "bg-red-100 text-red-700",
    partial: "bg-yellow-100 text-yellow-700",
    notApplicable: "bg-muted text-muted-foreground",
};
