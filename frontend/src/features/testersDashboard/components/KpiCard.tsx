import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { InfoPopover } from "./InfoPopover";

// The arrow (↑/↓) is always the literal direction the number moved; the
// color depends on `lowerIsBetter` for that metric (e.g. Fail Rate: lower
// is green). Required with no default so every call site states its own
// desirability explicitly.
function periodDelta(
  current: number,
  previous: number,
  lowerIsBetter: boolean,
): { text: string; className: string } | null {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { text: "New", className: "text-muted-foreground" };
  const change = Math.round(((current - previous) / previous) * 1000) / 10;
  if (change === 0) return { text: "→ No change", className: "text-muted-foreground" };
  const isGoodDirection = lowerIsBetter ? change < 0 : change > 0;
  return {
    text: `${change > 0 ? "↑" : "↓"} ${Math.abs(change)}% vs previous period`,
    className: isGoodDirection ? "text-emerald-600" : "text-red-500",
  };
}

export interface KpiCardProps {
  title: string;
  value: ReactNode;
  // Rendered in a smaller, muted span after `value` (e.g. "min", "/10") -
  // NOT used for "%" cards, which bake the percent sign directly into
  // `value` instead (matches each card's original markup).
  suffix?: string;
  icon: ReactNode;
  iconBgClass: string;
  infoContent: ReactNode;
  infoAlign?: "start" | "center" | "end";
  // Raw numeric value behind `value`, used for the vs-previous-period delta
  // - kept separate from `value` since `value` may be a formatted string
  // (e.g. toLocaleString()'d, or with a baked-in "%").
  currentValue: number;
  previousValue?: number;
  lowerIsBetter: boolean;
}

export function KpiCard({
  title,
  value,
  suffix,
  icon,
  iconBgClass,
  infoContent,
  infoAlign,
  currentValue,
  previousValue,
  lowerIsBetter,
}: KpiCardProps) {
  const delta = previousValue !== undefined ? periodDelta(currentValue, previousValue, lowerIsBetter) : null;

  return (
    <Card className="border-muted-foreground/10 min-h-[130px] flex flex-col">
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs text-muted-foreground uppercase">{title}</CardTitle>
          <InfoPopover title={title} align={infoAlign}>
            {infoContent}
          </InfoPopover>
        </div>
      </CardHeader>
      <CardContent className="pt-0 flex-1 flex flex-col justify-center">
        <div className="flex items-center justify-between gap-2">
          <div className="text-3xl font-bold">
            {value}
            {suffix !== undefined && (
              <span className="text-base font-medium text-muted-foreground">{" "}{suffix}</span>
            )}
          </div>
          <div className={`h-9 w-9 rounded-full ${iconBgClass} flex items-center justify-center shrink-0`}>{icon}</div>
        </div>
        {delta && <div className={`text-xs font-medium mt-1 ${delta.className}`}>{delta.text}</div>}
      </CardContent>
    </Card>
  );
}
