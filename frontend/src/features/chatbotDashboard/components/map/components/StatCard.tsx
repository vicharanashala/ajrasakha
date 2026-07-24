/* ============================================================
   STAT CARD - Reusable statistics display card
============================================================ */

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
    onClick?: () => void;
  tooltip?:React.ReactNode 
}

export function StatCard({
  label,
  value,
  icon,
  onClick,
  tooltip,
}: StatCardProps) {
  const card = (
    <div
      onClick={onClick}
      className={`rounded-xl border border-border bg-card p-3 transition-all
        ${
          onClick
            ? "cursor-pointer hover:bg-accent/40 hover:border-primary hover:shadow-md"
            : ""
        }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>

      <div className="mt-1 text-xl font-semibold tabular-nums text-foreground">
        {value}
      </div>
    </div>
  );
  if (!tooltip) return card
  return (
          <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {card}
        </TooltipTrigger>

        <TooltipContent side="top" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}