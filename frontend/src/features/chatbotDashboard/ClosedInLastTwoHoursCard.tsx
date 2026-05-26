import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

type ClosedInLastTwoHoursCardProps = {
  count: number;
  totalClosed: number;
};

export function ClosedInLastTwoHoursCard({
  count,
  totalClosed,
}: ClosedInLastTwoHoursCardProps) {
  return (
    <Card
      className="
        border
        border-border
        rounded-2xl
        bg-background/80
        backdrop-blur
        h-fit      
        "
    >
      <CardHeader className="pb-10">
        <div className="text-sm text-muted-foreground">
          Closed in Last 2 Hours
        </div>

        <div
          className="
            flex
            items-center
            justify-between
            gap-2
          "
        >
          <div
            className="
              text-5xl
              font-bold
              tracking-tight
            "
          >
            {count} / {totalClosed}
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="
                    flex h-4 w-4 cursor-pointer
                    items-center justify-center
                    rounded-full border text-[10px]
                  "
                >
                  i
                </span>
              </TooltipTrigger>

              <TooltipContent className="max-w-[240px]">
                <p>Questions closed during the last two hours.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
    </Card>
  );
}
