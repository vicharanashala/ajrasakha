import type { ReactNode } from "react";

export function formatLastUpdated(isoString: string | null): string {
  if (!isoString) return "unknown";
  const then = new Date(isoString);
  if (isNaN(then.getTime())) return "unknown";

  return then.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export interface AnalyticsSectionHeaderProps {
  title: string;
  description: string;
  sourceBadge?: string;
  // Right-hand side controls/status - source-specific (e.g. the Sheet
  // section's Exclude Failures toggle and sync/upload actions).
  children?: ReactNode;
}

// Title + source badge + description row shared by SheetAnalyticsSection
// and DbAnalyticsSection.
export function AnalyticsSectionHeader({ title, description, sourceBadge, children }: AnalyticsSectionHeaderProps) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">{title}</h2>
          {sourceBadge && (
            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-primary/10 text-primary border border-primary/20">
              {sourceBadge}
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </div>
  );
}
