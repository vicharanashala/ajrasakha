import { Badge } from "@/components/atoms/badge";
import { AlertTriangle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/atoms/tooltip";
import { getLastNonNAIndex } from "../../utils/getLastCompletedLevelIndex";
import type { ReviewRow } from "./reviewLevel.coloumn";


function parseTimeToMinutes(time: string): number {
  if (!time) return 0;

  const parts = time.split(":").map(n => Number(n || 0));
  const [h = 0, m = 0, s = 0] = parts;

  return h * 60 + m + s / 60;
}


function formatTimeWithUnits(time: string): string {
  if (!time) return "00h : 00m : 00s";

  const parts = time.split(":").map(n => Number(n || 0));
  const [h = 0, m = 0, s = 0] = parts;

  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");

  return `${hh}h : ${mm}m : ${ss}s`;
}

export function renderLevelBadge(row: ReviewRow, index: number) {
  const value = row.levels[index];

  if (value === "NA" || value == null) {
    return <Badge variant="outline">NA</Badge>;
  }

  const time = value.time ?? "-";          // shown in table
  const formatted = formatTimeWithUnits(time);  // shown in tooltip

  const lastIndex = getLastNonNAIndex(row.levels);
  const isLast = index === lastIndex;

  const highlightGreen =
    row.status === "in-review" && isLast;

  const isWarning =
    isLast && value.yet_to_complete === true;

  // color
  const minutes = parseTimeToMinutes(time);

  let warningColor = "text-amber-600";
  let badgeColor = "bg-accent/20 text-foreground border-accent/40";

  if (minutes < 30) {
    warningColor = "text-green-600";
  } else if (minutes > 120) {
    warningColor = "text-red-600";
  }

  if (highlightGreen) {
    badgeColor = "bg-green-500/10 text-green-600 border-green-500/30";
  }

  return (
    <div className="flex flex-col items-center gap-1">

      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={badgeColor}>
            {time}
          </Badge>
        </TooltipTrigger>

        <TooltipContent side="top">
          {formatted}
        </TooltipContent>
      </Tooltip>

      {isWarning && (
        <div className={`flex items-center gap-1 text-[11px] ${warningColor}`}>
          <AlertTriangle className="w-3 h-3" />
          <span>Pending</span>
        </div>
      )}
    </div>
  );
}
