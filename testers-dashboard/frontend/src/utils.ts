export function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100);
}

export function trendLabel(score: number): { text: string; className: string } {
  if (score >= 70) return { text: "↑ Good", className: "text-emerald-600" };
  if (score >= 40) return { text: "→ Average", className: "text-amber-500" };
  return { text: "↓ Low", className: "text-red-500" };
}

export function criticalFailuresLabel(dateRange: string, hasCustomDates: boolean): string {
  switch (dateRange) {
    case "today":
      return "Critical Failures Today";
    case "7days":
      return "Critical Failures (Last 7 Days)";
    case "30days":
      return "Critical Failures (Last 30 Days)";
    case "custom":
      return hasCustomDates ? "Critical Failures (Custom Range)" : "Critical Failures (All Time)";
    default:
      return "Critical Failures (All Time)";
  }
}

export function healthColorHex(value: number): string {
  if (value < 60) return "#ef4444"; // red-500
  if (value < 80) return "#eab308"; // yellow-500
  return "#10b981"; // emerald-500
}

// Release Health gauge color - mirrors the GO / GO WITH CONDITIONS / NO-GO
// decision thresholds (see releaseHealthDecisionDisplay() / kpis.ts's
// releaseHealthDecision()) so the gauge never contradicts the decision label.
export function releaseHealthColorHex(value: number): string {
  if (value < 90) return "#ef4444"; // red-500 - NO-GO
  if (value < 95) return "#eab308"; // yellow-500 - GO WITH CONDITIONS
  return "#10b981"; // emerald-500 - GO
}

// Display-only relabeling of the normalized Channel Tested value "Both" -
// the underlying value, filtering, and Cross Channel Consistency matching
// (kpis.ts) all still key off "Both"; this only changes what the user sees.
const CHANNEL_DISPLAY_LABELS: Record<string, string> = {
  Both: "Cross-Platform",
};

export function channelDisplayLabel(value: string): string {
  return CHANNEL_DISPLAY_LABELS[value] ?? value;
}

// Release Health's GO / GO WITH CONDITIONS / NO-GO headline decision -
// display-only mapping of backend's score-only ReleaseHealthDecision (see
// kpis.ts's releaseHealthDecision() for the thresholds and the mandatory-
// release-gates caveat).
const RELEASE_HEALTH_DECISION_DISPLAY: Record<string, { label: string; emoji: string; className: string }> = {
  GO: { label: "GO", emoji: "🟢", className: "text-emerald-600" },
  GO_WITH_CONDITIONS: { label: "GO WITH CONDITIONS", emoji: "🟡", className: "text-amber-500" },
  NO_GO: { label: "NO-GO", emoji: "🔴", className: "text-red-500" },
};

export function releaseHealthDecisionDisplay(decision: string): { label: string; emoji: string; className: string } {
  return RELEASE_HEALTH_DECISION_DISPLAY[decision] ?? RELEASE_HEALTH_DECISION_DISPLAY.NO_GO;
}

// Critical Defect Tickets' "no team assigned" bucket label - used whenever a
// linked Zoho ticket has no Team set (or its live Zoho data hasn't synced
// yet), so it still shows up on the card instead of being dropped.
export const UNASSIGNED_TEAM_LABEL = "Unassigned";
