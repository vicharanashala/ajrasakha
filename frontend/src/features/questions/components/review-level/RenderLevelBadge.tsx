import { Badge } from "@/components/atoms/badge";
import { AlertTriangle, CheckCircle } from "lucide-react";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/atoms/tooltip";
import { getLastNonNAIndex } from "../../utils/getLastCompletedLevelIndex";
import type { ReviewRow } from "./reviewLevel.coloumn";

function parseTimeToMinutes(time: string): number {
  if (!time) return 0;

  const parts = time.split(":").map((n) => Number(n || 0));
  const [h = 0, m = 0, s = 0] = parts;

  return h * 60 + m + s / 60;
}

function formatTimeWithUnits(time: string): {
  badge: string;
  tooltip: string;
  isDayFormat: boolean;
} {
  if (!time)
    return {
      badge: "00h : 00m",
      tooltip: "00h : 00m : 00s",
      isDayFormat: false,
    };

  const parts = time.split(":").map((n) => Number(n || 0));
  const [h = 0, m = 0, s = 0] = parts;
  const totalMinutes = h * 60 + m + s / 60;

  if (totalMinutes >= 24 * 60) {
    const days = Math.floor(totalMinutes / (24 * 60));
    const remainingMinutes = Math.floor(totalMinutes % (24 * 60));

    const hours = Math.floor(remainingMinutes / 60);
    const minutes = remainingMinutes % 60;

    let badge = `${days}d`;
    if (hours > 0) badge += ` : ${hours}h`;

    let tooltip = `${days}d`;
    tooltip += ` : ${hours}h`;
    tooltip += ` : ${minutes}m`;
    tooltip += ` : ${Math.floor(s)}s`;

    return {
      badge,
      tooltip,
      isDayFormat: true,
    };
  }

  const hh = h.toString().padStart(2, "0");
  const mm = m.toString().padStart(2, "0");
  const ss = s.toString().padStart(2, "0");

  return {
    badge: `${time}`,
    tooltip: `${hh}h : ${mm}m : ${ss}s`,
    isDayFormat: false,
  };
}

export function renderLevelBadge(row: ReviewRow, index: number) {
  const value = row.levels[index];

  if (value === "NA" || value == null) {
    return <Badge variant="outline">N/A</Badge>;
  }

  const time = value.time ?? "-";
  const { badge, tooltip, isDayFormat } = formatTimeWithUnits(time);
  const badgeTime = isDayFormat ? badge : time;
  const tooltipTime = tooltip;
  const lastIndex = getLastNonNAIndex(row.levels);
  const isLast = index === lastIndex;

  const minutes = parseTimeToMinutes(time);

  let color = {
    text: "text-green-600",
    badge: "bg-green-500/10 text-green-600 border-green-500/30",
  };

  if (minutes >= 30 && minutes <= 120) {
    color = {
      text: "text-amber-600",
      badge: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    };
  }

  if (minutes > 120) {
    color = {
      text: "text-red-600",
      badge: "bg-red-500/10 text-red-600 border-red-500/30",
    };
  }

  const isPending = isLast && value.yet_to_complete === true;
  const isCompleted = isLast && value.yet_to_complete === false;

  return (
    <div className="flex flex-col items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className={color.badge}>
            {badgeTime}
          </Badge>
        </TooltipTrigger>

        <TooltipContent side="top">{tooltipTime}</TooltipContent>
      </Tooltip>

      {isPending && (
        <div className={`flex items-center gap-1 text-[11px] ${color.text}`}>
          <AlertTriangle className="w-3 h-3" />
          <span>Pending</span>
        </div>
      )}

      {isCompleted && (
        <div className={`flex items-center gap-1 text-[11px] ${color.text}`}>
          <CheckCircle className="w-3 h-3" />
          <span>Finished</span>
        </div>
      )}
    </div>
  );
}
